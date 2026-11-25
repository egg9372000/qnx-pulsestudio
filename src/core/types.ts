export type QnxEventClass = 'THREAD' | 'COMM' | 'INT' | 'APS' | 'USREVENT';

export type QnxThreadState =
  | 'RUNNING'
  | 'READY'
  | 'SEND'
  | 'RECEIVE'
  | 'REPLY'
  | 'MUTEX'
  | 'CONDVAR'
  | 'NANOSLEEP';

export interface QnxTraceEvent {
  index: number;
  timeUs: number;
  cpu: number;
  eventClass: QnxEventClass;
  eventType: string;
  pid: number;
  tid: number;
  prio?: number;
  processName?: string;
  targetPid?: number;
  targetTid?: number;
  targetName?: string;
  irq?: number;
  partition?: string;
  budgetPct?: number;
  usedPct?: number;
  rawLine: string;
}

export interface PidinThreadRow {
  pid: number;
  tid: number;
  name: string;
  prio: number;
  schedPolicy: string; // 'r' (RR), 'f' (FIFO), 'o' (Other)
  state: string;
  blockedOn?: string;
}

export interface Slog2Entry {
  timestamp: string;
  process: string;
  buffer: string;
  severity: number; // 0=SHUTDOWN .. 7=DEBUG2
  severityLabel: 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
}

export interface TimelineSegment {
  id: string;
  pid: number;
  tid: number;
  processName: string;
  prio: number;
  cpu: number;
  state: QnxThreadState;
  startUs: number;
  endUs: number;
  durationUs: number;
}

export interface IpcChannelStats {
  channelKey: string; // e.g. can_bus_rx -> dev_can0
  clientName: string;
  serverName: string;
  count: number;
  minUs: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
  maxUs: number;
  samplesUs: number[];
}

export interface PriorityInversionFinding {
  id: string;
  victimProcess: string;
  victimPid: number;
  victimPrio: number;
  culpritProcess: string;
  culpritPid: number;
  culpritPrio: number;
  serverResource?: string;
  cpu: number;
  startUs: number;
  endUs: number;
  durationUs: number;
  severity: 'critical' | 'warning';
  remediation: string;
}

export interface IsrStats {
  irq: number;
  irqHex: string;
  count: number;
  maxUs: number;
  avgUs: number;
  totalUs: number;
}

export interface ApsPartitionFinding {
  partition: string;
  budgetPct: number;
  peakUsedPct: number;
  overrun: boolean;
}

export interface QnxAnalysisReport {
  scenarioName: string;
  traceDurationUs: number;
  cpuCount: number;
  eventCount: number;
  determinismScore: number; // 0..100
  verdict: 'DETERMINISTIC' | 'DEGRADED' | 'RT_VIOLATION';
  segments: TimelineSegment[];
  threads: Array<{
    key: string;
    pid: number;
    tid: number;
    processName: string;
    prio: number;
    cpuTimeUs: number;
    blockedTimeUs: number;
  }>;
  ipcChannels: IpcChannelStats[];
  overallIpcP99Us: number;
  inversions: PriorityInversionFinding[];
  isrs: IsrStats[];
  apsPartitions: ApsPartitionFinding[];
  pidinRows: PidinThreadRow[];
  slogEntries: Slog2Entry[];
  recommendations: string[];
}

export interface QnxScenarioBundle {
  id: string;
  title: string;
  domain: string;
  badge: string;
  summary: string;
  traceText: string;
  pidinText: string;
  slogText: string;
}
