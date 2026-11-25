# 📘 QNX 8.0 Codelab: Catching Priority Inversions & IPC Latency Spikes in 5 Minutes

> **Companion Tutorial for QNX PulseStudio (QNX Global Hackathon 2026)**  
> Works on **QNX 8.0 QEMU** (zero physical hardware required!) or **Raspberry Pi 4/5** with QNX Everywhere SDP 8.0.

---

## Learning Objectives
By the end of this 5-minute hands-on codelab, you will:
1. Build and run a real QNX Neutrino 8.0 C client/server program (`qnx_ipc_bench.c`) using `ChannelCreate`, `MsgSend`, `MsgReceive`, and `MsgReply`.
2. Capture a live microkernel event trace with **`tracelogger`**, thread state snapshot with **`pidin`**, and structured system logs with **`slog2info`**.
3. Convert the `.kev` trace using **`traceprinter`** and inspect it in **QNX PulseStudio** to catch a real priority inversion introduced by `_NTO_CHF_FIXED_PRIORITY`.
4. Automate a **CI/CD Real-Time Regression Gate** using `qnx-pulse check` so priority inversions can never slip into production firmware.

---

## Step 1: Compile the QNX 8.0 Target Benchmark
On your QNX SDP 8.0 host (Linux/macOS/Windows WSL):
```bash
source ~/qnx800/qnxsdp-env.sh
cd qnx-target
make ARCH=x86_64       # or ARCH=aarch64le for Raspberry Pi 5 / ARM64 QEMU
```

## Step 2: Copy & Run on Your QNX 8.0 Target (QEMU or Pi 5)
```bash
scp qnx_ipc_bench_x86_64 qnxuser@<TARGET_IP>:/tmp/qnx_ipc_bench
ssh qnxuser@<TARGET_IP>
```

On the QNX 8.0 target, capture a live kernel trace while triggering the fixed-priority inversion demo:
```sh
# 1. Start QNX kernel tracelogger in the background (captures 2 seconds into /tmp/trace.kev)
tracelogger -s 2 -f /tmp/trace.kev &

# 2. Run our IPC benchmark with priority inversion simulation
/tmp/qnx_ipc_bench --simulate-inversion

# 3. Capture thread priority & blocked-state snapshot + slog2 logs
pidin -F "%a %b %n %p %J %m" > /tmp/pidin.txt
slog2info > /tmp/slog2.txt

# 4. Convert binary .kev trace to human/machine-parseable text via traceprinter
traceprinter -f /tmp/trace.kev -o /tmp/trace.txt
```

## Step 3: Visualize in QNX PulseStudio (Host Browser)
Copy `/tmp/trace.txt`, `/tmp/pidin.txt`, and `/tmp/slog2.txt` back to your host workstation, open **QNX PulseStudio** (`npm run dev`), and drop the files into the **Import QNX 8.0 Artifacts** panel (or explore the 3 built-in real-time scenarios immediately!).

You will immediately see:
- **Interactive Multi-Core Thread Scheduling Timeline** (`RUNNING`, `REPLY`, `SEND`, `MUTEX`, `ISR`)
- **Client → Server IPC Latency Matrix** (`p50`, `p95`, `p99`, `max µs`)
- **Automatic Priority Inversion Root-Cause Callout** with exact microsecond stall duration and remediation advice
- **APS Budget Compliance & Hardware ISR Jitter Breakdown**

## Step 4: Enforce Determinism in CI/CD
Add a one-line regression check to your GitHub Actions / GitLab CI pipeline:
```bash
npx qnx-pulse check trace.txt --pidin pidin.txt --slog slog2.txt \
  --max-ipc-p99-us 500 --fail-on-inversion --fail-on-aps
```
- Exits **`0`** when real-time latency, priority inheritance, and APS budgets stay within bounds.
- Exits **`1`** with exact offending threads & microsecond spikes if a regression is introduced!
