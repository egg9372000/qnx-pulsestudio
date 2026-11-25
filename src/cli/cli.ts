#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { analyzeQnxSession } from '../core/analyzer';
import { BUILTIN_SCENARIOS } from '../core/scenarios';

function parseArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1]!.startsWith('--')) {
    return args[idx + 1];
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printUsage() {
  console.log(`
QNX PulseStudio CLI — Real-Time Regression Gate for QNX Neutrino RTOS 8.0

USAGE:
  qnx-pulse check <traceprinter.txt> [options]
  qnx-pulse demo [--json]

OPTIONS:
  --pidin <file>           Optional pidin snapshot file
  --slog <file>            Optional slog2info log file
  --max-ipc-p99-us <num>   Fail CI if overall MsgSend/MsgReply p99 exceeds threshold (default: 500)
  --fail-on-inversion      Fail CI if any Priority Inversion is detected
  --fail-on-aps            Fail CI if any APS partition exceeds its budget
  --json                   Output structured JSON report for CI pipelines
`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    process.exit(0);
  }

  const asJson = hasFlag(args, '--json');

  if (cmd === 'demo') {
    const reports = BUILTIN_SCENARIOS.map((sc) =>
      analyzeQnxSession({
        scenarioName: sc.title,
        traceText: sc.traceText,
        pidinText: sc.pidinText,
        slogText: sc.slogText,
      })
    );
    if (asJson) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }
    for (const r of reports) {
      console.log(`\n=== ${r.scenarioName} ===`);
      console.log(
        `Verdict: ${r.verdict} | Determinism Score: ${r.determinismScore}/100 | IPC p99: ${r.overallIpcP99Us}us | Inversions: ${r.inversions.length}`
      );
      for (const rec of r.recommendations) {
        console.log(`  - ${rec}`);
      }
    }
    return;
  }

  if (cmd === 'check') {
    const traceFile = args[1];
    if (!traceFile || traceFile.startsWith('--')) {
      console.error('Error: missing <traceprinter.txt> path.');
      printUsage();
      process.exit(2);
    }

    const traceText = fs.readFileSync(path.resolve(traceFile), 'utf8');
    const pidinPath = parseArg(args, '--pidin');
    const slogPath = parseArg(args, '--slog');
    const pidinText = pidinPath ? fs.readFileSync(path.resolve(pidinPath), 'utf8') : '';
    const slogText = slogPath ? fs.readFileSync(path.resolve(slogPath), 'utf8') : '';

    const report = analyzeQnxSession({
      scenarioName: path.basename(traceFile),
      traceText,
      pidinText,
      slogText,
    });

    const maxP99 = Number(parseArg(args, '--max-ipc-p99-us') ?? 500);
    const failOnInversion = hasFlag(args, '--fail-on-inversion');
    const failOnAps = hasFlag(args, '--fail-on-aps');

    const failures: string[] = [];
    if (report.overallIpcP99Us > maxP99) {
      failures.push(`IPC p99 (${report.overallIpcP99Us}us) exceeded limit (${maxP99}us)`);
    }
    if (failOnInversion && report.inversions.length > 0) {
      failures.push(`Detected ${report.inversions.length} real-time Priority Inversion(s)`);
    }
    if (failOnAps && report.apsPartitions.some((p) => p.overrun)) {
      failures.push(`Detected APS partition budget overrun(s)`);
    }

    if (asJson) {
      console.log(JSON.stringify({ passed: failures.length === 0, failures, report }, null, 2));
    } else {
      console.log(`QNX PulseStudio Audit: ${report.scenarioName}`);
      console.log(
        `Score: ${report.determinismScore}/100 (${report.verdict}) | Events: ${report.eventCount} | IPC p99: ${report.overallIpcP99Us}us | Inversions: ${report.inversions.length}`
      );
      if (failures.length > 0) {
        console.error('\nCI REGRESSION GATE FAILED:');
        for (const f of failures) console.error(`  [FAIL] ${f}`);
      } else {
        console.log('\n[PASS] All QNX real-time determinism gates passed.');
      }
    }

    process.exit(failures.length > 0 ? 1 : 0);
  }

  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exit(2);
}

main();
