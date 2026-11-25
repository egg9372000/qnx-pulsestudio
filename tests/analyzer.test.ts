import { describe, expect, it } from 'vitest';
import { analyzeQnxSession } from '../src/core/analyzer';
import { parsePidinOutput, parseQnxTrace, parseSlog2Output } from '../src/core/parsers';
import { BUILTIN_SCENARIOS } from '../src/core/scenarios';

describe('QNX PulseStudio — Kernel Trace, IPC & Priority Inversion Engine', () => {
  it('parses QNX traceprinter, pidin, and slog2info formats accurately', () => {
    const adas = BUILTIN_SCENARIOS[0]!;
    const events = parseQnxTrace(adas.traceText);
    const pidin = parsePidinOutput(adas.pidinText);
    const slog = parseSlog2Output(adas.slogText);

    expect(events.length).toBeGreaterThan(20);
    expect(pidin.length).toBe(5);
    expect(pidin[0]!.name).toBe('can_bus_rx');
    expect(pidin[0]!.prio).toBe(24);
    expect(slog.length).toBe(3);
    expect(slog[0]!.severityLabel).toBe('ERROR');
  });

  it('detects the 1400+ us Priority Inversion and APS overrun in the ADAS Braking scenario', () => {
    const adas = BUILTIN_SCENARIOS[0]!;
    const report = analyzeQnxSession({
      scenarioName: adas.title,
      traceText: adas.traceText,
      pidinText: adas.pidinText,
      slogText: adas.slogText,
    });

    expect(report.verdict).toBe('RT_VIOLATION');
    expect(report.determinismScore).toBeLessThan(60);
    expect(report.inversions.length).toBeGreaterThanOrEqual(1);
    expect(report.inversions[0]!.victimProcess).toBe('can_bus_rx');
    expect(report.inversions[0]!.culpritProcess).toBe('telemetry_upload');
    expect(report.inversions[0]!.durationUs).toBeGreaterThan(1000);
    expect(report.overallIpcP99Us).toBeGreaterThan(1000);
    expect(report.apsPartitions.some((p) => p.partition === 'telemetry_bg' && p.overrun)).toBe(true);
  });

  it('verifies the Surgical Robot scenario as DETERMINISTIC (100/100, zero inversions)', () => {
    const surgical = BUILTIN_SCENARIOS[1]!;
    const report = analyzeQnxSession({
      scenarioName: surgical.title,
      traceText: surgical.traceText,
      pidinText: surgical.pidinText,
      slogText: surgical.slogText,
    });

    expect(report.verdict).toBe('DETERMINISTIC');
    expect(report.determinismScore).toBe(100);
    expect(report.inversions).toHaveLength(0);
    expect(report.overallIpcP99Us).toBeLessThan(100);
    expect(report.apsPartitions.every((p) => !p.overrun)).toBe(true);
  });

  it('detects excessive ISR jitter (>80us) and APS starvation in the Drone SLAM scenario', () => {
    const drone = BUILTIN_SCENARIOS[2]!;
    const report = analyzeQnxSession({
      scenarioName: drone.title,
      traceText: drone.traceText,
      pidinText: drone.pidinText,
      slogText: drone.slogText,
    });

    expect(report.isrs[0]!.irqHex).toBe('0x38');
    expect(report.isrs[0]!.maxUs).toBe(145);
    expect(report.apsPartitions.some((p) => p.partition === 'vision_slam' && p.overrun)).toBe(true);
    expect(report.recommendations.some((r) => r.includes('InterruptAttachEvent'))).toBe(true);
  });
});
