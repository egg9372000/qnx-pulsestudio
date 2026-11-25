import type { QnxScenarioBundle } from './types';

export const BUILTIN_SCENARIOS: QnxScenarioBundle[] = [
  {
    id: 'adas-braking-inversion',
    title: 'Automotive ADAS Braking Loop (Priority Inversion)',
    domain: 'Automotive / ISO 26262',
    badge: 'RT VIOLATION',
    summary:
      'QNX 8.0 trace from an ADAS emergency braking controller where high-priority can_bus_rx (prio 24) stalls 1,420µs behind telemetry_upload (prio 10) on /dev/can0.',
    traceText: `# QNX Neutrino 8.0 traceprinter dump — ADAS ECU (aarch64le)
t:100us  CPU:0 THREAD:THRUNNING   pid:4100 tid:1 prio:24 name:can_bus_rx
t:140us  CPU:0 COMM:MSG_SENDVNC   pid:4100 tid:1 target_pid:4102 target_name:dev_can0
t:145us  CPU:0 THREAD:THREPLY     pid:4100 tid:1 prio:24 name:can_bus_rx
t:155us  CPU:0 THREAD:THRUNNING   pid:4102 tid:1 prio:21 name:dev_can0
t:190us  CPU:0 COMM:MSG_REPLYV    pid:4102 tid:1 target_pid:4100 target_tid:1
t:195us  CPU:0 THREAD:THRUNNING   pid:4100 tid:1 prio:24 name:can_bus_rx
t:260us  CPU:0 THREAD:THNANOSLEEP pid:4100 tid:1 prio:24 name:can_bus_rx
t:280us  CPU:0 THREAD:THRUNNING   pid:4108 tid:1 prio:10 name:telemetry_upload
t:320us  CPU:1 THREAD:THRUNNING   pid:4110 tid:1 prio:18 name:radar_fusion
t:350us  CPU:1 COMM:MSG_SENDVNC   pid:4110 tid:1 target_pid:4112 target_name:io_sock
t:355us  CPU:1 THREAD:THREPLY     pid:4110 tid:1 prio:18 name:radar_fusion
t:410us  CPU:1 COMM:MSG_REPLYV    pid:4112 tid:1 target_pid:4110 target_tid:1
t:420us  CPU:1 THREAD:THRUNNING   pid:4110 tid:1 prio:18 name:radar_fusion
t:520us  CPU:0 INT:INT_ENTR       irq:0x21
t:542us  CPU:0 INT:INT_EXIT       irq:0x21
t:600us  CPU:0 THREAD:THRUNNING   pid:4100 tid:1 prio:24 name:can_bus_rx
t:630us  CPU:0 COMM:MSG_SENDVNC   pid:4100 tid:1 target_pid:4102 target_name:dev_can0
t:635us  CPU:0 THREAD:THREPLY     pid:4100 tid:1 prio:24 name:can_bus_rx
t:650us  CPU:0 THREAD:THRUNNING   pid:4108 tid:1 prio:10 name:telemetry_upload
t:950us  CPU:0 APS:APS_BUDGET     partition:adas_crit budget_pct:45 used_pct:41
t:1100us CPU:0 APS:APS_BUDGET     partition:telemetry_bg budget_pct:15 used_pct:24
t:1980us CPU:0 THREAD:THRUNNING   pid:4102 tid:1 prio:21 name:dev_can0
t:2045us CPU:0 COMM:MSG_REPLYV    pid:4102 tid:1 target_pid:4100 target_tid:1
t:2055us CPU:0 THREAD:THRUNNING   pid:4100 tid:1 prio:24 name:can_bus_rx
t:2180us CPU:0 THREAD:THNANOSLEEP pid:4100 tid:1 prio:24 name:can_bus_rx
t:2300us CPU:1 THREAD:THRUNNING   pid:4110 tid:1 prio:18 name:radar_fusion
t:2450us CPU:1 THREAD:THNANOSLEEP pid:4110 tid:1 prio:18 name:radar_fusion`,
    pidinText: `pid tid name prio STATE Blocked
4100 1 can_bus_rx 24r REPLY 4102 (dev_can0)
4102 1 dev_can0 21r MUTEX 4108 (telemetry_upload)
4108 1 telemetry_upload 10r RUNNING
4110 1 radar_fusion 18r RECEIVE 1
4112 1 io_sock 20r RECEIVE 1`,
    slogText: `Nov 25 03:12:04.118 can_bus_rx.4100 adas_buf 2 [ERROR] CAN braking frame deadline warning: MsgSend to /dev/can0 stalled 1415us
Nov 25 03:12:04.119 dev_can0.4102 driver_buf 3 [WARN] Ring buffer mutex held by low-priority client pid=4108 (telemetry_upload)
Nov 25 03:12:04.120 aps_mon.102 sys_buf 3 [WARN] Partition telemetry_bg exceeded budget (24% > 15%)`,
  },

  {
    id: 'surgical-robot-healthy',
    title: 'Surgical Robot 1kHz Kinematics Loop (Healthy RT)',
    domain: 'Medical Robotics',
    badge: 'DETERMINISTIC',
    summary:
      'Clean QNX 8.0 deterministic 1 kHz control loop with priority inheritance active, sub-60µs IPC p99, tight 18µs ISR latency, and full APS budget compliance.',
    traceText: `# QNX Neutrino 8.0 traceprinter dump — Surgical Arm Controller
t:100us  CPU:0 INT:INT_ENTR       irq:0x14
t:116us  CPU:0 INT:INT_EXIT       irq:0x14
t:120us  CPU:0 THREAD:THRUNNING   pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:155us  CPU:0 COMM:MSG_SENDVNC   pid:5200 tid:1 target_pid:5201 target_name:servo_resmgr
t:158us  CPU:0 THREAD:THREPLY     pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:162us  CPU:0 THREAD:THRUNNING   pid:5201 tid:1 prio:30 name:servo_resmgr
t:194us  CPU:0 COMM:MSG_REPLYV    pid:5201 tid:1 target_pid:5200 target_tid:1
t:198us  CPU:0 THREAD:THRUNNING   pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:260us  CPU:0 THREAD:THNANOSLEEP pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:300us  CPU:1 THREAD:THRUNNING   pid:5210 tid:1 prio:22 name:force_feedback
t:340us  CPU:1 COMM:MSG_SENDVNC   pid:5210 tid:1 target_pid:5201 target_name:servo_resmgr
t:344us  CPU:1 THREAD:THREPLY     pid:5210 tid:1 prio:22 name:force_feedback
t:382us  CPU:1 COMM:MSG_REPLYV    pid:5201 tid:1 target_pid:5210 target_tid:1
t:386us  CPU:1 THREAD:THRUNNING   pid:5210 tid:1 prio:22 name:force_feedback
t:480us  CPU:1 THREAD:THNANOSLEEP pid:5210 tid:1 prio:22 name:force_feedback
t:900us  CPU:0 APS:APS_BUDGET     partition:motion_crit budget_pct:60 used_pct:44
t:920us  CPU:1 APS:APS_BUDGET     partition:ui_display budget_pct:25 used_pct:18
t:1100us CPU:0 INT:INT_ENTR       irq:0x14
t:1118us CPU:0 INT:INT_EXIT       irq:0x14
t:1122us CPU:0 THREAD:THRUNNING   pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:1160us CPU:0 COMM:MSG_SENDVNC   pid:5200 tid:1 target_pid:5201 target_name:servo_resmgr
t:1163us CPU:0 THREAD:THREPLY     pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:1199us CPU:0 COMM:MSG_REPLYV    pid:5201 tid:1 target_pid:5200 target_tid:1
t:1203us CPU:0 THREAD:THRUNNING   pid:5200 tid:1 prio:30 name:kinematics_ctrl
t:1270us CPU:0 THREAD:THNANOSLEEP pid:5200 tid:1 prio:30 name:kinematics_ctrl`,
    pidinText: `pid tid name prio STATE Blocked
5200 1 kinematics_ctrl 30f NANOSLEEP
5201 1 servo_resmgr 30f RECEIVE 1
5210 1 force_feedback 22r RECEIVE 1
5220 1 audit_logger 10r RECEIVE 1`,
    slogText: `Nov 25 03:15:10.001 kinematics_ctrl.5200 rt_buf 5 [INFO] 1000Hz servo cycle verified nominal (max jitter 4us)
Nov 25 03:15:10.002 aps_mon.102 sys_buf 5 [INFO] All APS partitions within deterministic bounds`,
  },

  {
    id: 'drone-isr-aps-overload',
    title: 'Autonomous Drone LiDAR SLAM (ISR Spike & APS Overload)',
    domain: 'Robotics / Edge AI',
    badge: 'DEGRADED',
    summary:
      'LiDAR DMA interrupt handler spikes to 145µs inside InterruptAttach while the vision_slam APS partition exceeds its 35% CPU budget.',
    traceText: `# QNX Neutrino 8.0 traceprinter dump — Drone Flight Controller
t:100us  CPU:0 THREAD:THRUNNING   pid:6100 tid:1 prio:28 name:flight_stabilizer
t:180us  CPU:0 INT:INT_ENTR       irq:0x38
t:325us  CPU:0 INT:INT_EXIT       irq:0x38
t:335us  CPU:0 COMM:MSG_SENDVNC   pid:6100 tid:1 target_pid:6105 target_name:imu_resmgr
t:340us  CPU:0 THREAD:THREPLY     pid:6100 tid:1 prio:28 name:flight_stabilizer
t:460us  CPU:0 COMM:MSG_REPLYV    pid:6105 tid:1 target_pid:6100 target_tid:1
t:470us  CPU:0 THREAD:THRUNNING   pid:6100 tid:1 prio:28 name:flight_stabilizer
t:540us  CPU:0 THREAD:THNANOSLEEP pid:6100 tid:1 prio:28 name:flight_stabilizer
t:560us  CPU:1 THREAD:THRUNNING   pid:6120 tid:1 prio:16 name:lidar_slam
t:620us  CPU:1 COMM:MSG_SENDVNC   pid:6120 tid:1 target_pid:6125 target_name:dev_lidar0
t:625us  CPU:1 THREAD:THREPLY     pid:6120 tid:1 prio:16 name:lidar_slam
t:990us  CPU:1 COMM:MSG_REPLYV    pid:6125 tid:1 target_pid:6120 target_tid:1
t:1000us CPU:1 THREAD:THRUNNING   pid:6120 tid:1 prio:16 name:lidar_slam
t:1200us CPU:1 APS:APS_BUDGET     partition:flight_crit budget_pct:50 used_pct:39
t:1220us CPU:1 APS:APS_BUDGET     partition:vision_slam budget_pct:35 used_pct:54
t:1450us CPU:1 THREAD:THNANOSLEEP pid:6120 tid:1 prio:16 name:lidar_slam`,
    pidinText: `pid tid name prio STATE Blocked
6100 1 flight_stabilizer 28f NANOSLEEP
6105 1 imu_resmgr 26f RECEIVE 1
6120 1 lidar_slam 16r RUNNING
6125 1 dev_lidar0 19r RECEIVE 1`,
    slogText: `Nov 25 03:20:44.412 dev_lidar0.6125 lidar_buf 3 [WARN] DMA IRQ 0x38 ISR duration 145us exceeded 80us threshold
Nov 25 03:20:44.415 aps_mon.102 sys_buf 2 [ERROR] Partition vision_slam throttled at 54% (budget 35%)`,
  },
];
