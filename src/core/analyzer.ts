import { parsePidinOutput, parseQnxTrace, parseSlog2Output } from './parsers';
import type {
  ApsPartitionFinding,
  IpcChannelStats,
  IsrStats,
  PriorityInversionFinding,
  QnxAnalysisReport,
  QnxThreadState,
  TimelineSegment,
} from './types';

function mapThreadState(eventType: string): QnxThreadState | null {
  switch (eventType) {
    case 'THRUNNING':
      return 'RUNNING';
    case 'THREADY':
      return 'READY';
    case 'THSEND':
      return 'SEND';
    case 'THRECEIVE':
      return 'RECEIVE';
    case 'THREPLY':
      return 'REPLY';
    case 'THMUTEX':
      return 'MUTEX';
    case 'THCONDVAR':
      return 'CONDVAR';
    case 'THNANOSLEEP':
      return 'NANOSLEEP';
    default:
      return null;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]!);
}

/**
 * Comprehensive QNX Neutrino 8.0 Real-Time Microkernel Analyzer:
 * - Reconstructs multi-core thread scheduling timelines
 * - Measures Client -> Server MsgSend/MsgReply IPC latency percentiles
 * - Detects Real-Time Priority Inversions with exact microsecond duration & culprit thread
 * - Measures Hardware ISR (INT_ENTR/INT_EXIT) latency & jitter
 * - Checks Adaptive Partitioning Scheduler (APS) budget compliance
 */
export function analyzeQnxSession(input: {
  scenarioName: string;
  traceText: string;
  pidinText?: string;
  slogText?: string;
}): QnxAnalysisReport {
  const events = parseQnxTrace(input.traceText);
  const pidinRows = parsePidinOutput(input.pidinText ?? '');
  const slogEntries = parseSlog2Output(input.slogText ?? '');

  const startUs = events.length > 0 ? events[0]!.timeUs : 0;
  const endUs = events.length > 0 ? events[events.length - 1]!.timeUs : 0;
  const traceDurationUs = Math.max(1, endUs - startUs);

  // Known process metadata map from pidin + trace events
  const procNameByPid = new Map<number, string>();
  const prioByKey = new Map<string, number>();
  for (const row of pidinRows) {
    procNameByPid.set(row.pid, row.name);
    prioByKey.set(`${row.pid}:${row.tid}`, row.prio);
  }
  for (const ev of events) {
    if (ev.pid && ev.processName) procNameByPid.set(ev.pid, ev.processName);
    if (ev.targetPid && ev.targetName) procNameByPid.set(ev.targetPid, ev.targetName);
    if (ev.pid && ev.prio !== undefined) prioByKey.set(`${ev.pid}:${ev.tid}`, ev.prio);
  }

  let maxCpu = 0;
  const segments: TimelineSegment[] = [];
  const activeStateByThread = new Map<
    string,
    {
      pid: number;
      tid: number;
      processName: string;
      prio: number;
      cpu: number;
      state: QnxThreadState;
      startUs: number;
    }
  >();

  // IPC tracking: clientKey -> { startUs, serverPid, serverName }
  const pendingIpc = new Map<
    string,
    { startUs: number; clientName: string; serverName: string; serverPid: number }
  >();
  const ipcSamplesByChannel = new Map<
    string,
    { clientName: string; serverName: string; samples: number[] }
  >();

  // ISR tracking: irq -> entryTimeUs
  const pendingIsr = new Map<number, number>();
  const isrDurations = new Map<number, number[]>();

  // APS tracking
  const apsMap = new Map<string, { budgetPct: number; peakUsedPct: number }>();

  // Inversion tracking: currently blocked high-priority threads (prio >= 20)
  const blockedHighPrio = new Map<
    string,
    {
      pid: number;
      tid: number;
      processName: string;
      prio: number;
      startUs: number;
      cpu: number;
      serverPid?: number;
      serverResource?: string;
    }
  >();
  const inversions: PriorityInversionFinding[] = [];
  const recordedInversionKeys = new Set<string>();

  for (const ev of events) {
    if (ev.cpu > maxCpu) maxCpu = ev.cpu;
    const tKey = `${ev.pid}:${ev.tid}`;
    const pName = ev.processName ?? procNameByPid.get(ev.pid) ?? `pid_${ev.pid}`;
    const prio = ev.prio ?? prioByKey.get(tKey) ?? 10;

    if (ev.eventClass === 'THREAD') {
      const nextState = mapThreadState(ev.eventType);
      if (nextState) {
        const prev = activeStateByThread.get(tKey);
        if (prev && ev.timeUs > prev.startUs) {
          segments.push({
            id: `seg-${segments.length}`,
            pid: prev.pid,
            tid: prev.tid,
            processName: prev.processName,
            prio: prev.prio,
            cpu: prev.cpu,
            state: prev.state,
            startUs: prev.startUs - startUs,
            endUs: ev.timeUs - startUs,
            durationUs: ev.timeUs - prev.startUs,
          });
        }

        activeStateByThread.set(tKey, {
          pid: ev.pid,
          tid: ev.tid,
          processName: pName,
          prio,
          cpu: ev.cpu,
          state: nextState,
          startUs: ev.timeUs,
        });

        // Track high-priority blocking for priority inversion analysis
        if (prio >= 20 && (nextState === 'SEND' || nextState === 'REPLY' || nextState === 'MUTEX')) {
          const pend = pendingIpc.get(tKey);
          blockedHighPrio.set(tKey, {
            pid: ev.pid,
            tid: ev.tid,
            processName: pName,
            prio,
            startUs: ev.timeUs,
            cpu: ev.cpu,
            serverPid: pend?.serverPid,
            serverResource: pend?.serverName,
          });
        } else if (nextState === 'RUNNING') {
          blockedHighPrio.delete(tKey);

          // Check if an unrelated LOWER-priority thread is running while a HIGH-priority thread is blocked!
          for (const [, victim] of blockedHighPrio.entries()) {
            if (prio < victim.prio && ev.pid !== victim.pid && ev.pid !== victim.serverPid) {
              const invKey = `${victim.pid}->${ev.pid}@${victim.startUs}`;
              if (!recordedInversionKeys.has(invKey)) {
                recordedInversionKeys.add(invKey);
                // Measure until victim resumes or end of trace
                const resumeEv = events.find(
                  (future) =>
                    future.timeUs > ev.timeUs &&
                    future.eventClass === 'THREAD' &&
                    future.eventType === 'THRUNNING' &&
                    future.pid === victim.pid &&
                    future.tid === victim.tid
                );
                const invEnd = resumeEv ? resumeEv.timeUs : endUs;
                const dur = Math.max(1, invEnd - victim.startUs);
                if (dur >= 150) {
                  inversions.push({
                    id: `inv-${inversions.length + 1}`,
                    victimProcess: victim.processName,
                    victimPid: victim.pid,
                    victimPrio: victim.prio,
                    culpritProcess: pName,
                    culpritPid: ev.pid,
                    culpritPrio: prio,
                    serverResource: victim.serverResource,
                    cpu: ev.cpu,
                    startUs: victim.startUs - startUs,
                    endUs: invEnd - startUs,
                    durationUs: dur,
                    severity: dur >= 500 ? 'critical' : 'warning',
                    remediation: `Enable QNX Priority Inheritance (NTO_CHF_FIXED_PRIORITY off / PTHREAD_PRIO_INHERIT) on ${
                      victim.serverResource ?? 'shared resource'
                    } or isolate ${pName} (prio ${prio}) into a lower APS partition.`,
                  });
                }
              }
            }
          }
        }
      }
    } else if (ev.eventClass === 'COMM') {
      if (ev.eventType.includes('SEND')) {
        const sPid = ev.targetPid ?? 0;
        const sName = ev.targetName ?? procNameByPid.get(sPid) ?? `pid_${sPid}`;
        pendingIpc.set(tKey, {
          startUs: ev.timeUs,
          clientName: pName,
          serverName: sName,
          serverPid: sPid,
        });
      } else if (ev.eventType.includes('REPLY')) {
        const clientKey = `${ev.targetPid ?? 0}:${ev.targetTid ?? 1}`;
        const req = pendingIpc.get(clientKey);
        if (req && ev.timeUs >= req.startUs) {
          const latencyUs = ev.timeUs - req.startUs;
          const chKey = `${req.clientName} → ${req.serverName}`;
          let bucket = ipcSamplesByChannel.get(chKey);
          if (!bucket) {
            bucket = { clientName: req.clientName, serverName: req.serverName, samples: [] };
            ipcSamplesByChannel.set(chKey, bucket);
          }
          bucket.samples.push(latencyUs);
          pendingIpc.delete(clientKey);
        }
      }
    } else if (ev.eventClass === 'INT' && ev.irq !== undefined) {
      if (ev.eventType === 'INT_ENTR') {
        pendingIsr.set(ev.irq, ev.timeUs);
      } else if (ev.eventType === 'INT_EXIT') {
        const enter = pendingIsr.get(ev.irq);
        if (enter !== undefined && ev.timeUs >= enter) {
          const list = isrDurations.get(ev.irq) ?? [];
          list.push(ev.timeUs - enter);
          isrDurations.set(ev.irq, list);
          pendingIsr.delete(ev.irq);
        }
      }
    } else if (ev.eventClass === 'APS' && ev.partition) {
      const prev = apsMap.get(ev.partition);
      const budget = ev.budgetPct ?? prev?.budgetPct ?? 20;
      const used = ev.usedPct ?? 0;
      apsMap.set(ev.partition, {
        budgetPct: budget,
        peakUsedPct: Math.max(prev?.peakUsedPct ?? 0, used),
      });
    }
  }

  // Close trailing segments cleanly
  for (const [, st] of activeStateByThread.entries()) {
    if (endUs > st.startUs) {
      segments.push({
        id: `seg-${segments.length}`,
        pid: st.pid,
        tid: st.tid,
        processName: st.processName,
        prio: st.prio,
        cpu: st.cpu,
        state: st.state,
        startUs: st.startUs - startUs,
        endUs: endUs - startUs,
        durationUs: endUs - st.startUs,
      });
    }
  }

  // Aggregate per-thread stats
  const threadMap = new Map<
    string,
    { pid: number; tid: number; processName: string; prio: number; cpuTimeUs: number; blockedTimeUs: number }
  >();
  for (const seg of segments) {
    const key = `${seg.pid}:${seg.tid}`;
    const existing = threadMap.get(key) ?? {
      pid: seg.pid,
      tid: seg.tid,
      processName: seg.processName,
      prio: seg.prio,
      cpuTimeUs: 0,
      blockedTimeUs: 0,
    };
    if (seg.state === 'RUNNING') existing.cpuTimeUs += seg.durationUs;
    else if (['SEND', 'REPLY', 'MUTEX', 'CONDVAR'].includes(seg.state)) {
      existing.blockedTimeUs += seg.durationUs;
    }
    threadMap.set(key, existing);
  }

  const threads = [...threadMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.prio - a.prio || b.cpuTimeUs - a.cpuTimeUs);

  // Aggregate IPC stats
  const allIpcSamples: number[] = [];
  const ipcChannels: IpcChannelStats[] = [...ipcSamplesByChannel.entries()]
    .map(([channelKey, bucket]) => {
      const sorted = [...bucket.samples].sort((a, b) => a - b);
      allIpcSamples.push(...sorted);
      return {
        channelKey,
        clientName: bucket.clientName,
        serverName: bucket.serverName,
        count: sorted.length,
        minUs: Math.round(sorted[0] ?? 0),
        p50Us: percentile(sorted, 50),
        p95Us: percentile(sorted, 95),
        p99Us: percentile(sorted, 99),
        maxUs: Math.round(sorted[sorted.length - 1] ?? 0),
        samplesUs: bucket.samples,
      };
    })
    .sort((a, b) => b.p99Us - a.p99Us);

  const sortedAllIpc = [...allIpcSamples].sort((a, b) => a - b);
  const overallIpcP99Us = percentile(sortedAllIpc, 99);

  // Aggregate ISR stats
  const isrs: IsrStats[] = [...isrDurations.entries()]
    .map(([irq, list]) => {
      const total = list.reduce((a, b) => a + b, 0);
      return {
        irq,
        irqHex: `0x${irq.toString(16).toUpperCase()}`,
        count: list.length,
        maxUs: Math.round(Math.max(...list)),
        avgUs: Math.round(total / list.length),
        totalUs: Math.round(total),
      };
    })
    .sort((a, b) => b.maxUs - a.maxUs);

  // Aggregate APS findings
  const apsPartitions: ApsPartitionFinding[] = [...apsMap.entries()].map(([partition, info]) => ({
    partition,
    budgetPct: info.budgetPct,
    peakUsedPct: info.peakUsedPct,
    overrun: info.peakUsedPct > info.budgetPct,
  }));

  // Compute Real-Time Determinism Score (0..100)
  let score = 100;
  const recommendations: string[] = [];

  for (const inv of inversions) {
    score -= inv.severity === 'critical' ? 28 : 14;
    recommendations.push(
      `[Priority Inversion] ${inv.victimProcess} (prio ${inv.victimPrio}) stalled ${inv.durationUs}µs while ${inv.culpritProcess} (prio ${inv.culpritPrio}) held CPU — ${inv.remediation}`
    );
  }

  if (overallIpcP99Us > 500) {
    score -= 20;
    recommendations.push(
      `[IPC Latency] Overall MsgSend/MsgReply p99 reached ${overallIpcP99Us}µs (>500µs RT target). Audit server pool sizing or switch non-blocking notifications to MsgSendPulse().`
    );
  } else if (overallIpcP99Us > 200) {
    score -= 8;
    recommendations.push(
      `[IPC Latency] p99 IPC latency is ${overallIpcP99Us}µs — consider zero-copy shared memory (shm_open) for high-frequency sensor payloads.`
    );
  }

  const maxIsr = isrs[0]?.maxUs ?? 0;
  if (maxIsr > 80) {
    score -= 15;
    recommendations.push(
      `[ISR Jitter] Hardware IRQ ${isrs[0]!.irqHex} took ${maxIsr}µs. Defer heavy work from InterruptAttach() to an InterruptAttachEvent() IST pulse handler.`
    );
  }

  for (const aps of apsPartitions) {
    if (aps.overrun) {
      score -= 15;
      recommendations.push(
        `[APS Budget] Partition "${aps.partition}" peaked at ${aps.peakUsedPct}% (budget ${aps.budgetPct}%). Rebalance Adaptive Partitioning budgets in QNX IFS buildfile.`
      );
    }
  }

  const errorSlogs = slogEntries.filter((s) => s.severity <= 2);
  if (errorSlogs.length > 0) {
    score -= Math.min(12, errorSlogs.length * 4);
    recommendations.push(
      `[slog2info] ${errorSlogs.length} ERROR/CRITICAL log event(s) captured during trace window.`
    );
  }

  const determinismScore = Math.max(0, Math.min(100, score));
  const verdict: QnxAnalysisReport['verdict'] =
    determinismScore >= 85 && inversions.length === 0
      ? 'DETERMINISTIC'
      : determinismScore >= 60
      ? 'DEGRADED'
      : 'RT_VIOLATION';

  return {
    scenarioName: input.scenarioName,
    traceDurationUs,
    cpuCount: maxCpu + 1,
    eventCount: events.length,
    determinismScore,
    verdict,
    segments,
    threads,
    ipcChannels,
    overallIpcP99Us,
    inversions,
    isrs,
    apsPartitions,
    pidinRows,
    slogEntries,
    recommendations,
  };
}
