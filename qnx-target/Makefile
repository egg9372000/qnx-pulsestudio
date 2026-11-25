# QNX SDP 8.0 Makefile for qnx_ipc_bench
# Usage:
#   source ~/qnx800/qnxsdp-env.sh
#   make ARCH=x86_64
#   make ARCH=aarch64le

ARCH ?= x86_64
CC = qcc -Vgcc_nto$(ARCH)
CFLAGS = -O2 -Wall -Wextra -std=c11
LDFLAGS = -lslog2
TARGET = qnx_ipc_bench_$(ARCH)

all: $(TARGET)

$(TARGET): qnx_ipc_bench.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f qnx_ipc_bench_x86_64 qnx_ipc_bench_aarch64le
