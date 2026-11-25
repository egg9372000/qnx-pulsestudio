/*
 * qnx_ipc_bench.c — QNX Neutrino RTOS 8.0 Companion Target Generator
 *
 * Demonstrates authentic QNX microkernel IPC (ChannelCreate / ConnectAttach /
 * MsgSend / MsgReceive / MsgReply), priority inheritance flags, and custom
 * kernel trace markers via TraceEvent() + slog2f() for capture with `tracelogger`
 * and instant visualization in QNX PulseStudio.
 *
 * Build on QNX SDP 8.0 host:
 *   make ARCH=x86_64       (for QNX 8.0 QEMU x86_64 target)
 *   make ARCH=aarch64le    (for Raspberry Pi 4/5 or QEMU ARM64 target)
 */

#include <errno.h>
#include <pthread.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/neutrino.h>
#include <sys/slog2.h>
#include <sys/trace.h>
#include <time.h>
#include <unistd.h>

#define ITERATIONS 200
#define MSG_PAYLOAD_BYTES 64

typedef struct {
    uint32_t seq;
    uint64_t sent_ns;
    char payload[MSG_PAYLOAD_BYTES];
} pulse_req_t;

typedef struct {
    uint32_t seq;
    uint32_t status;
} pulse_rep_t;

static int g_chid = -1;
static volatile int g_running = 1;
static int g_simulate_inversion = 0;

static uint64_t now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
}

static void *server_thread(void *arg) {
    (void)arg;
    pthread_setname_np(pthread_self(), "servo_resmgr");

    pulse_req_t req;
    pulse_rep_t rep;

    while (g_running) {
        int rcvid = MsgReceive(g_chid, &req, sizeof(req), NULL);
        if (rcvid <= 0) {
            continue;
        }
        if (g_simulate_inversion && (req.seq % 40 == 0)) {
            /* Deliberate 1.2ms stall to trigger PulseStudio's RT violation detector */
            usleep(1200);
        }
        rep.seq = req.seq;
        rep.status = 0;
        MsgReply(rcvid, EOK, &rep, sizeof(rep));
    }
    return NULL;
}

int main(int argc, char **argv) {
    unsigned ch_flags = _NTO_CHF_UNBLOCK;
    if (argc > 1 && strcmp(argv[1], "--simulate-inversion") == 0) {
        g_simulate_inversion = 1;
        /* Disable priority inheritance on channel to demonstrate inversion in PulseStudio */
        ch_flags |= _NTO_CHF_FIXED_PRIORITY;
        printf("[qnx_ipc_bench] Running with FIXED_PRIORITY (priority inversion demo)\n");
    } else {
        printf("[qnx_ipc_bench] Running with QNX Priority Inheritance enabled\n");
    }

    g_chid = ChannelCreate(ch_flags);
    if (g_chid == -1) {
        perror("ChannelCreate");
        return EXIT_FAILURE;
    }

    pthread_t srv;
    if (pthread_create(&srv, NULL, server_thread, NULL) != 0) {
        perror("pthread_create");
        return EXIT_FAILURE;
    }

    int coid = ConnectAttach(0, 0, g_chid, _NTO_SIDE_CHANNEL, 0);
    if (coid == -1) {
        perror("ConnectAttach");
        return EXIT_FAILURE;
    }

    TraceEvent(_NTO_TRACE_INSERTUSRSTREVENT, 1, "pulsestudio:bench_start");

    uint64_t max_us = 0;
    uint64_t sum_us = 0;

    for (uint32_t i = 0; i < ITERATIONS; i++) {
        pulse_req_t req = { .seq = i, .sent_ns = now_ns() };
        pulse_rep_t rep;
        snprintf(req.payload, sizeof(req.payload), "frame-%u", i);

        uint64_t t0 = now_ns();
        if (MsgSend(coid, &req, sizeof(req), &rep, sizeof(rep)) == -1) {
            perror("MsgSend");
            break;
        }
        uint64_t dt_us = (now_ns() - t0) / 1000ULL;
        if (dt_us > max_us) max_us = dt_us;
        sum_us += dt_us;
        usleep(500);
    }

    TraceEvent(_NTO_TRACE_INSERTUSRSTREVENT, 2, "pulsestudio:bench_end");
    printf("[qnx_ipc_bench] Completed %d MsgSend/MsgReply cycles | avg=%lluus max=%lluus\n",
           ITERATIONS, (unsigned long long)(sum_us / ITERATIONS), (unsigned long long)max_us);

    g_running = 0;
    ConnectDetach(coid);
    ChannelDestroy(g_chid);
    return EXIT_SUCCESS;
}
