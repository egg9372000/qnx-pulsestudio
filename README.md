# ⚡ QNX PulseStudio — Real-Time Kernel Trace, IPC Latency & Priority Inversion Analyzer for QNX 8.0

> **Built for the 2026 QNX Global Hackathon**  
> **Primary Track:** Developer Tooling and Host Tools  
> **Bonus Tracks:** Best use of QNX-specific Technologies · Best Codelab or Tutorial (`CODELAB.md`)

---

## 🎯 Why QNX PulseStudio?

QNX Neutrino RTOS 8.0 powers safety-critical automotive, medical, and robotics systems where a single 1 ms priority inversion or `MsgSend()` bottleneck can violate hard real-time deadlines. Historically, analyzing QNX `tracelogger` / `traceprinter` kernel captures, `pidin` thread snapshots, and `slog2info` logs required launching a heavy Eclipse IDE profiler manually—making quick browser triage and automated CI/CD determinism gating painful.

**QNX PulseStudio** is a zero-setup, cross-platform **host developer tool + CI regression gate CLI + QNX 8.0 C target companion** that turns raw QNX 8.0 diagnostics into instant microsecond-resolution real-time insight.

---

## ✨ Key Capabilities

1. **Authentic QNX 8.0 Diagnostic Parsers (`src/core/parsers.ts`)**
   - **`traceprinter` (`tracelogger`)** parser: `THREAD` (`THRUNNING`, `THREADY`, `THSEND`, `THRECEIVE`, `THREPLY`, `THMUTEX`, `THNANOSLEEP`), `COMM` (`MSG_SENDVNC`, `MSG_REPLYV`), `INT` (`INT_ENTR`, `INT_EXIT`), and `APS` (`APS_BUDGET`).
   - **`pidin`** thread priority, scheduling policy (`r`/`f`), and blocked-on resource parser.
   - **`slog2info`** severity-indexed structured system log parser.
2. **QNX-Specific Microkernel Intelligence (`src/core/analyzer.ts`)**
   - **Priority Inversion Detector**: Pinpoints exact microsecond windows where high-priority real-time threads (`prio >= 20`) block on `SEND`/`REPLY`/`MUTEX` while lower-priority threads hold the CPU, recommending QNX Priority Inheritance & APS isolation fixes.
   - **Client → Server IPC Latency Matrix**: Computes `p50`, `p95`, `p99`, and `max µs` for every `MsgSend`/`MsgReply` channel.
   - **Hardware ISR Jitter Profiler**: Tracks `INT_ENTR`/`INT_EXIT` latency per IRQ vector and recommends `InterruptAttachEvent()` IST offloading when spikes exceed 80 µs.
   - **APS (Adaptive Partitioning Scheduler) Compliance Monitor**: Flags CPU partition budget overruns.
   - **Real-Time Determinism Score (0–100)** and `DETERMINISTIC` / `DEGRADED` / `RT_VIOLATION` verdict.
3. **Interactive Host Oscilloscope & Timeline UI (`src/web/`)**
   - Multi-core microsecond thread-state Gantt timeline with highlighted Priority Inversion red zones.
   - 3 built-in realistic QNX 8.0 scenarios (**Automotive ADAS Braking Inversion**, **Surgical Robot 1 kHz Healthy RT**, **Autonomous Drone LiDAR ISR/APS Overload**) + 100% local client-side custom trace import.
4. **CI/CD Real-Time Regression Gate CLI (`src/cli/cli.ts`)**
   ```bash
   npx qnx-pulse check trace.txt --pidin pidin.txt --slog slog2.txt \
     --max-ipc-p99-us 500 --fail-on-inversion --fail-on-aps
   ```
5. **QNX 8.0 C Target Companion & 5-Minute QEMU Codelab (`qnx-target/` & `CODELAB.md`)**
   - Real QNX 8.0 C source (`qnx_ipc_bench.c` + `Makefile` for `qcc` `x86_64` / `aarch64le`) demonstrating `ChannelCreate`, `_NTO_CHF_FIXED_PRIORITY`, `MsgSend`/`MsgReceive`/`MsgReply`, and `TraceEvent()`.
   - Full hands-on step-by-step tutorial in [`CODELAB.md`](./CODELAB.md).

---

## 🚀 Quickstart

```bash
npm install
npm run typecheck
npm test
npm run build

# Run the interactive host profiler UI (http://localhost:5175)
npm run dev

# Run the CI regression gate CLI demo
node dist/cli/cli.js demo
```
