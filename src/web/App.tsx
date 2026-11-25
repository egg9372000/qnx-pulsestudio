import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Cpu,
  FileCode2,
  Gauge,
  Layers,
  ShieldAlert,
  Terminal,
  Upload,
  Zap,
} from 'lucide-react';
import { analyzeQnxSession } from '../core/analyzer';
import { BUILTIN_SCENARIOS } from '../core/scenarios';

type ActiveTab = 'timeline' | 'ipc' | 'logs' | 'import';

function scoreColor(score: number): string {
  if (score >= 85) return '#34d399';
  if (score >= 60) return '#fbbf24';
  return '#f87171';
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_SCENARIOS[0]!.id);
  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');
  const [customTrace, setCustomTrace] = useState<string>('');
  const [customPidin, setCustomPidin] = useState<string>('');
  const [customSlog, setCustomSlog] = useState<string>('');
  const [usingCustom, setUsingCustom] = useState<boolean>(false);

  const activeScenario = useMemo(
    () => BUILTIN_SCENARIOS.find((s) => s.id === selectedId) ?? BUILTIN_SCENARIOS[0]!,
    [selectedId]
  );

  const report = useMemo(() => {
    if (usingCustom && customTrace.trim()) {
      return analyzeQnxSession({
        scenarioName: 'Custom QNX 8.0 Trace Import',
        traceText: customTrace,
        pidinText: customPidin,
        slogText: customSlog,
      });
    }
    return analyzeQnxSession({
      scenarioName: activeScenario.title,
      traceText: activeScenario.traceText,
      pidinText: activeScenario.pidinText,
      slogText: activeScenario.slogText,
    });
  }, [activeScenario, customPidin, customSlog, customTrace, usingCustom]);

  const handleLoadCustom = () => {
    if (!customTrace.trim()) return;
    setUsingCustom(true);
    setActiveTab('timeline');
  };

  return (
    <div className="qp-shell">
      {/* Header */}
      <header className="qp-topbar">
        <div className="qp-brand">
          <div className="qp-mark">
            <Activity size={21} strokeWidth={2.5} />
          </div>
          <div>
            <h1>QNX PulseStudio</h1>
            <p>Real-Time Kernel Trace, IPC Latency, Priority Inversion &amp; APS Analyzer for QNX 8.0</p>
          </div>
        </div>

        <div className="scenario-bar">
          {BUILTIN_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              className={`sc-btn ${!usingCustom && selectedId === sc.id ? 'active' : ''}`}
              onClick={() => {
                setUsingCustom(false);
                setSelectedId(sc.id);
              }}
            >
              <Cpu size={13} />
              <span>{sc.domain}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Active Scenario Summary Banner */}
      <section className="panel-card" style={{ padding: '12px 16px' }}>
        <div className="panel-head">
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{report.scenarioName}</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
              {usingCustom
                ? 'Analyzing user-imported QNX 8.0 traceprinter / pidin / slog2info artifacts locally in browser.'
                : activeScenario.summary}
            </div>
          </div>
          <span className={`badge ${report.verdict}`}>
            {report.verdict === 'DETERMINISTIC' ? '✓ DETERMINISTIC' : report.verdict === 'DEGRADED' ? '⚠ DEGRADED RT' : '⛔ RT VIOLATION'}
          </span>
        </div>
      </section>

      {/* KPI Strip */}
      <section className="kpi-strip">
        <div className="kpi-card">
          <span className="kpi-label">Determinism Score</span>
          <span className="kpi-value" style={{ color: scoreColor(report.determinismScore) }}>
            {report.determinismScore}/100
          </span>
          <span className="kpi-sub">{report.eventCount} kernel events</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">IPC MsgSend p99</span>
          <span
            className="kpi-value"
            style={{ color: report.overallIpcP99Us > 500 ? '#f87171' : '#38bdf8' }}
          >
            {report.overallIpcP99Us}µs
          </span>
          <span className="kpi-sub">{report.ipcChannels.length} active channel(s)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Priority Inversions</span>
          <span
            className="kpi-value"
            style={{ color: report.inversions.length > 0 ? '#f87171' : '#34d399' }}
          >
            {report.inversions.length}
          </span>
          <span className="kpi-sub">
            {report.inversions.length > 0
              ? `Max stall ${report.inversions[0]!.durationUs}µs`
              : 'Priority inheritance nominal'}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Peak Hardware ISR</span>
          <span
            className="kpi-value"
            style={{ color: (report.isrs[0]?.maxUs ?? 0) > 80 ? '#fbbf24' : '#34d399' }}
          >
            {report.isrs[0]?.maxUs ?? 0}µs
          </span>
          <span className="kpi-sub">
            {report.isrs[0] ? `IRQ ${report.isrs[0].irqHex} (${report.isrs[0].count}×)` : 'No IRQs'}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Trace Window</span>
          <span className="kpi-value" style={{ color: '#e2e8f0' }}>
            {(report.traceDurationUs / 1000).toFixed(2)}ms
          </span>
          <span className="kpi-sub">{report.cpuCount} CPU core(s)</span>
        </div>
      </section>

      {/* Priority Inversion Alert Callouts */}
      {report.inversions.map((inv) => (
        <div className="inv-alert" key={inv.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, color: '#fca5a5', fontSize: 13 }}>
            <AlertOctagon size={16} color="#ef4444" />
            PRIORITY INVERSION DETECTED — {inv.victimProcess} (prio {inv.victimPrio}) stalled {inv.durationUs}µs behind{' '}
            {inv.culpritProcess} (prio {inv.culpritPrio}) on CPU{inv.cpu}
          </div>
          <div style={{ fontSize: 12, color: '#fecaca' }}>
            Window: <span className="mono">{inv.startUs}µs → {inv.endUs}µs</span>
            {inv.serverResource ? ` · Resource: ${inv.serverResource}` : ''} · Fix: {inv.remediation}
          </div>
        </div>
      ))}

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>
          <Layers size={14} /> Kernel Scheduling Timeline
        </button>
        <button className={`nav-tab ${activeTab === 'ipc' ? 'active' : ''}`} onClick={() => setActiveTab('ipc')}>
          <Gauge size={14} /> IPC Latency, ISR &amp; APS Budgets
        </button>
        <button className={`nav-tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          <Terminal size={14} /> pidin &amp; slog2info ({report.pidinRows.length + report.slogEntries.length})
        </button>
        <button className={`nav-tab ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
          <Upload size={14} /> Import Your QNX 8.0 Trace
        </button>
      </nav>

      {/* TAB 1: KERNEL SCHEDULING TIMELINE */}
      {activeTab === 'timeline' && (
        <section className="panel-card">
          <div className="panel-head">
            <div className="panel-title">
              <Zap size={15} color="#00d2ff" /> Microsecond Thread State Gantt (QNX Neutrino 8.0)
            </div>
            <div className="legend-row">
              <span><i className="legend-dot" style={{ background: '#10b981' }} />RUNNING</span>
              <span><i className="legend-dot" style={{ background: '#ef4444' }} />REPLY-BLOCKED</span>
              <span><i className="legend-dot" style={{ background: '#f59e0b' }} />SEND</span>
              <span><i className="legend-dot" style={{ background: '#3b82f6' }} />RECEIVE</span>
              <span><i className="legend-dot" style={{ background: 'rgba(148,163,184,0.3)' }} />NANOSLEEP</span>
            </div>
          </div>

          <div className="timeline-wrap">
            {report.threads.map((th) => {
              const segs = report.segments.filter((s) => `${s.pid}:${s.tid}` === th.key);
              return (
                <div className="tl-row" key={th.key}>
                  <div className="tl-label">
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{th.processName}</span>
                    <span style={{ color: th.prio >= 20 ? '#38bdf8' : '#94a3b8' }}>p{th.prio}</span>
                  </div>
                  <div className="tl-track">
                    {segs.map((seg) => {
                      const leftPct = (seg.startUs / report.traceDurationUs) * 100;
                      const widthPct = Math.max(0.8, (seg.durationUs / report.traceDurationUs) * 100);
                      return (
                        <div
                          key={seg.id}
                          className={`tl-seg ${seg.state}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          title={`${seg.processName} [CPU${seg.cpu}] ${seg.state}: ${seg.durationUs}µs (${seg.startUs}→${seg.endUs}µs)`}
                        >
                          {widthPct > 7 ? `${seg.state} ${seg.durationUs}µs` : ''}
                        </div>
                      );
                    })}
                    {report.inversions
                      .filter((inv) => inv.victimPid === th.pid || inv.culpritPid === th.pid)
                      .map((inv) => (
                        <div
                          key={inv.id}
                          className="inv-zone-overlay"
                          style={{
                            left: `${(inv.startUs / report.traceDurationUs) * 100}%`,
                            width: `${(inv.durationUs / report.traceDurationUs) * 100}%`,
                          }}
                          title={`Priority Inversion Window (${inv.durationUs}µs)`}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendations & CI Gate */}
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--dim)', marginBottom: 6 }}>
              REAL-TIME DIAGNOSTICS &amp; REMEDIATION
            </div>
            {report.recommendations.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                <CheckCircle2 size={16} /> Zero real-time violations detected — system meets QNX 8.0 deterministic RT targets!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {report.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 11px',
                      borderRadius: 9,
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      fontSize: 12.5,
                      color: '#fde68a',
                    }}
                  >
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="cli-snippet">
            $ npx qnx-pulse check trace.txt --pidin pidin.txt --slog slog2.txt --max-ipc-p99-us 500 --fail-on-inversion --fail-on-aps
          </div>
        </section>
      )}

      {/* TAB 2: IPC LATENCY, ISR & APS BUDGETS */}
      {activeTab === 'ipc' && (
        <div className="grid-2">
          <section className="panel-card">
            <div className="panel-title">
              <Gauge size={15} color="#00d2ff" /> MsgSend / MsgReply IPC Latency Matrix
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel (Client → Server)</th>
                  <th>Calls</th>
                  <th>p50</th>
                  <th>p99</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {report.ipcChannels.map((ch) => (
                  <tr key={ch.channelKey}>
                    <td className="mono" style={{ fontWeight: 700 }}>{ch.channelKey}</td>
                    <td className="mono">{ch.count}</td>
                    <td className="mono">{ch.p50Us}µs</td>
                    <td className="mono" style={{ color: ch.p99Us > 500 ? '#f87171' : '#34d399', fontWeight: 800 }}>
                      {ch.p99Us}µs
                    </td>
                    <td className="mono">{ch.maxUs}µs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel-card">
            <div className="panel-title">
              <ShieldAlert size={15} color="#fbbf24" /> APS Partitions &amp; Hardware ISRs
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.apsPartitions.map((aps) => (
                <div key={aps.partition} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>APS:{aps.partition}</span>
                    <span className="mono" style={{ color: aps.overrun ? '#f87171' : '#34d399' }}>
                      Peak {aps.peakUsedPct}% / Budget {aps.budgetPct}% {aps.overrun ? '(OVERRUN)' : '(OK)'}
                    </span>
                  </div>
                  <div className="aps-bar">
                    <div
                      className="aps-fill"
                      style={{
                        width: `${Math.min(100, aps.peakUsedPct)}%`,
                        background: aps.overrun ? '#ef4444' : '#10b981',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <table className="data-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Hardware IRQ</th>
                  <th>Count</th>
                  <th>Avg Duration</th>
                  <th>Max Spike</th>
                </tr>
              </thead>
              <tbody>
                {report.isrs.map((isr) => (
                  <tr key={isr.irq}>
                    <td className="mono" style={{ fontWeight: 700 }}>IRQ {isr.irqHex} ({isr.irq})</td>
                    <td className="mono">{isr.count}</td>
                    <td className="mono">{isr.avgUs}µs</td>
                    <td className="mono" style={{ color: isr.maxUs > 80 ? '#fbbf24' : '#34d399', fontWeight: 800 }}>
                      {isr.maxUs}µs
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* TAB 3: PIDIN & SLOG2INFO */}
      {activeTab === 'logs' && (
        <div className="grid-2">
          <section className="panel-card">
            <div className="panel-title">
              <Cpu size={15} color="#00d2ff" /> pidin Thread Priority Snapshot
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>PID/TID</th>
                  <th>Process</th>
                  <th>Prio</th>
                  <th>State</th>
                  <th>Blocked On</th>
                </tr>
              </thead>
              <tbody>
                {report.pidinRows.map((row) => (
                  <tr key={`${row.pid}:${row.tid}`}>
                    <td className="mono">{row.pid}/{row.tid}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{row.name}</td>
                    <td className="mono">{row.prio}{row.schedPolicy}</td>
                    <td className="mono">{row.state}</td>
                    <td className="mono" style={{ color: 'var(--dim)' }}>{row.blockedOn ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel-card">
            <div className="panel-title">
              <FileCode2 size={15} color="#a78bfa" /> slog2info System Log Stream
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.slogEntries.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '9px 11px',
                    borderRadius: 9,
                    background: '#06090f',
                    border: `1px solid ${log.severity <= 2 ? 'rgba(239,68,68,0.45)' : 'var(--border)'}`,
                    fontSize: 12,
                  }}
                >
                  <div className="mono" style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 3 }}>
                    {log.timestamp} · <b style={{ color: '#e2e8f0' }}>{log.process}</b> [{log.buffer}] ·{' '}
                    <span style={{ color: log.severity <= 2 ? '#f87171' : log.severity === 3 ? '#fbbf24' : '#34d399' }}>
                      {log.severityLabel}
                    </span>
                  </div>
                  <div>{log.message}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: IMPORT CUSTOM QNX 8.0 TRACE */}
      {activeTab === 'import' && (
        <section className="panel-card">
          <div className="panel-title">
            <Upload size={15} color="#00d2ff" /> Import QNX 8.0 traceprinter / pidin / slog2info Output
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--dim)' }}>
            Capture a kernel trace on QNX 8.0 QEMU or Raspberry Pi with <code>tracelogger -s 2 -f /tmp/trace.kev &amp;&amp; traceprinter -f /tmp/trace.kev</code> and paste below (100% local client-side parsing — zero data leaves your workstation):
          </p>
          <textarea
            className="import-textarea"
            placeholder="Paste QNX traceprinter output (e.g. t:100us CPU:0 THREAD:THRUNNING pid:4100 tid:1 prio:24 name:can_bus_rx)..."
            value={customTrace}
            onChange={(e) => setCustomTrace(e.target.value)}
          />
          <div className="grid-2">
            <textarea
              className="import-textarea"
              style={{ minHeight: 90 }}
              placeholder="Optional: paste pidin output..."
              value={customPidin}
              onChange={(e) => setCustomPidin(e.target.value)}
            />
            <textarea
              className="import-textarea"
              style={{ minHeight: 90 }}
              placeholder="Optional: paste slog2info output..."
              value={customSlog}
              onChange={(e) => setCustomSlog(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary-btn" onClick={handleLoadCustom}>
              <Activity size={15} /> Analyze Custom QNX 8.0 Trace
            </button>
            <button
              className="sc-btn"
              onClick={() => {
                setCustomTrace(BUILTIN_SCENARIOS[0]!.traceText);
                setCustomPidin(BUILTIN_SCENARIOS[0]!.pidinText);
                setCustomSlog(BUILTIN_SCENARIOS[0]!.slogText);
              }}
            >
              Load Sample ADAS Trace into Editor
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
