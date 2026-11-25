import type { PidinThreadRow, QnxEventClass, QnxTraceEvent, Slog2Entry } from './types';

function parseTimestampUs(raw: string): number {
  const cleaned = raw.trim().replace(/^t:/i, '');
  if (/^0x[0-9a-f]+$/i.test(cleaned)) {
    return parseInt(cleaned, 16);
  }
  if (/ms$/i.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 1000);
  }
  return parseFloat(cleaned.replace(/us$/i, '')) || 0;
}

function kvNumber(line: string, key: string): number | undefined {
  const re = new RegExp(`\\b${key}:(0x[0-9a-f]+|\\d+(?:\\.\\d+)?)`, 'i');
  const m = line.match(re);
  if (!m?.[1]) return undefined;
  return m[1].toLowerCase().startsWith('0x') ? parseInt(m[1], 16) : Number(m[1]);
}

function kvString(line: string, key: string): string | undefined {
  const re = new RegExp(`\\b${key}:([^\\s]+)`, 'i');
  const m = line.match(re);
  return m?.[1];
}

/**
 * Parses QNX 8.0 `traceprinter` kernel event text output into structured QnxTraceEvent records.
 * Supports key-value traceprinter dumps (THREAD, COMM, INT, APS, USREVENT).
 */
export function parseQnxTrace(traceText: string): QnxTraceEvent[] {
  const events: QnxTraceEvent[] = [];
  const lines = traceText.split(/\r?\n/);

  let index = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('--')) continue;

    const timeMatch = line.match(/\bt:([^\s]+)/i) ?? line.match(/^(\d+(?:\.\d+)?(?:us|ms)?)\b/i);
    if (!timeMatch?.[1]) continue;

    const classTypeMatch = line.match(
      /\b(THREAD|COMM|INT|APS|USREVENT)\s*:\s*([A-Z0-9_]+)/i
    );
    if (!classTypeMatch?.[1] || !classTypeMatch[2]) continue;

    const timeUs = parseTimestampUs(timeMatch[1]);
    const cpu = kvNumber(line, 'CPU') ?? 0;
    const eventClass = classTypeMatch[1].toUpperCase() as QnxEventClass;
    const eventType = classTypeMatch[2].toUpperCase();

    const pid = kvNumber(line, 'pid') ?? 0;
    const tid = kvNumber(line, 'tid') ?? 1;
    const prio = kvNumber(line, 'prio');
    const processName = kvString(line, 'name');
    const targetPid = kvNumber(line, 'target_pid');
    const targetTid = kvNumber(line, 'target_tid');
    const targetName = kvString(line, 'target_name');
    const irq = kvNumber(line, 'irq');
    const partition = kvString(line, 'partition');
    const budgetPct = kvNumber(line, 'budget_pct');
    const usedPct = kvNumber(line, 'used_pct');

    events.push({
      index: index++,
      timeUs,
      cpu,
      eventClass,
      eventType,
      pid,
      tid,
      prio,
      processName,
      targetPid,
      targetTid,
      targetName,
      irq,
      partition,
      budgetPct,
      usedPct,
      rawLine: line,
    });
  }

  return events.sort((a, b) => a.timeUs - b.timeUs || a.index - b.index);
}

/**
 * Parses QNX `pidin` thread snapshot output (`pid tid name prio STATE blocked_on`).
 */
export function parsePidinOutput(pidinText: string): PidinThreadRow[] {
  const rows: PidinThreadRow[] = [];
  for (const raw of pidinText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^pid\b/i.test(line) || line.startsWith('#')) continue;
    const m = line.match(
      /^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)([rfo]?)\s+([A-Z]+)(?:\s+(.*))?$/i
    );
    if (!m) continue;
    rows.push({
      pid: Number(m[1]),
      tid: Number(m[2]),
      name: m[3]!,
      prio: Number(m[4]),
      schedPolicy: m[5] || 'r',
      state: m[6]!.toUpperCase(),
      blockedOn: m[7]?.trim() || undefined,
    });
  }
  return rows;
}

/**
 * Parses QNX `slog2info` structured log lines.
 */
export function parseSlog2Output(slogText: string): Slog2Entry[] {
  const entries: Slog2Entry[] = [];
  for (const raw of slogText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(
      /^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(.+)$/
    );
    if (!m) continue;
    const sev = Number(m[4]);
    const severityLabel: Slog2Entry['severityLabel'] =
      sev <= 1
        ? 'CRITICAL'
        : sev === 2
        ? 'ERROR'
        : sev === 3
        ? 'WARN'
        : sev <= 5
        ? 'INFO'
        : 'DEBUG';

    entries.push({
      timestamp: m[1]!,
      process: m[2]!,
      buffer: m[3]!,
      severity: sev,
      severityLabel,
      message: m[5]!.trim(),
    });
  }
  return entries;
}
