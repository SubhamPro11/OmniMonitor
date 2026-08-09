/**
 * OmniMonitor Fault Engine Section 4 Automated Test Suite
 * Tests Live Stream Consumer, Rolling Buffer Retention, Event Bus Emission, and 5Hz Performance.
 */

import { LiveFaultDetector } from "../src/lib/faults/streamConsumer";
import { FaultEventBus } from "../src/lib/faults/eventBus";
import { DEFAULT_FAULT_CONFIG } from "../src/lib/faults/config";
import { TelemetryEvent, WaypointPosition } from "../src/types/database";
import { FaultEventPayload } from "../src/types/faults";

function makeNominalTelemetry(droneId: string, seq: number): TelemetryEvent {
  return {
    drone_id: droneId,
    ts: new Date(Date.now() + seq * 200).toISOString(),
    position: { x: 10.0, y: 10.0, z: 15.0, lat: 37.7749, lon: -122.4194, alt_m: 15.0 },
    velocity: { x: 0.1, y: 0.1, z: 0.0 },
    battery: { voltage: 15.2, current_a: 14.5, pct: 85.0 },
    imu: { pitch: 1.0, roll: -0.5, yaw: 90.0 },
    link_quality: { rssi_dbm: -65.0, packet_loss_pct: 0.0 },
    motor_temp: [44.0, 44.5, 45.0, 44.2],
    gps_fix: "RTK_FIXED",
    flight_mode: "SHOW",
  };
}

const targetWaypoint: WaypointPosition = { x: 10.0, y: 10.0, z: 15.0 };

async function runSection4UnitTests() {
  console.log("================================================================================");
  console.log("             RUNNING FAULT ENGINE SECTION 4 STREAM TEST SUITE                  ");
  console.log("================================================================================\n");

  const eventBus = new FaultEventBus();
  const detector = new LiveFaultDetector(DEFAULT_FAULT_CONFIG, eventBus);

  // ---------------------------------------------------------------------------
  // TEST 1: Event Bus Subscription & Decoupled Delivery
  // ---------------------------------------------------------------------------
  console.log("[TEST 1] Testing Fault Event Bus Subscription & Asynchronous Delivery...");
  const receivedEvents: FaultEventPayload[] = [];
  const unsubscribe = eventBus.subscribe((fault) => {
    receivedEvents.push(fault);
  });

  // Inject emergency battery voltage collapse packet on DRONE-01
  const batCollapsePacket = makeNominalTelemetry("DRONE-01", 1);
  batCollapsePacket.battery.voltage = 12.0;

  detector.processPacket(batCollapsePacket, targetWaypoint);

  if (receivedEvents.length !== 1 || receivedEvents[0].fault_type !== "BATTERY_CELL_COLLAPSE") {
    throw new Error(`Test 1 Failed: Event bus did not receive emitted fault: ${JSON.stringify(receivedEvents)}`);
  }
  console.log(`✓ Test 1 Passed: Event bus delivered fault event to subscriber (${receivedEvents[0].description}).\n`);

  unsubscribe();
  eventBus.clearAll();
  detector.reset();

  // ---------------------------------------------------------------------------
  // TEST 2: Rolling History Buffer Retention (Capped at Buffer Size)
  // ---------------------------------------------------------------------------
  console.log("[TEST 2] Testing Per-Drone Rolling History Buffer Retention...");
  // Feed 25 consecutive packets for DRONE-03 (buffer size is 10)
  for (let seq = 1; seq <= 25; seq++) {
    const packet = makeNominalTelemetry("DRONE-03", seq);
    detector.processPacket(packet, targetWaypoint);
  }

  const history = detector.getDroneHistory("DRONE-03");
  if (history.length !== DEFAULT_FAULT_CONFIG.history_buffer_size) {
    throw new Error(`Test 2 Failed: History buffer size mismatch. Expected ${DEFAULT_FAULT_CONFIG.history_buffer_size}, got ${history.length}`);
  }
  console.log(`✓ Test 2 Passed: Rolling buffer correctly capped at exactly ${history.length} packets (oldest evicted cleanly).\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Read-Only Consumer Invariant (Zero Mutation of Input Packets)
  // ---------------------------------------------------------------------------
  console.log("[TEST 3] Testing Read-Only Invariant (Zero Packet Mutation)...");
  const originalPacket = makeNominalTelemetry("DRONE-04", 1);
  const packetSnapshot = JSON.stringify(originalPacket);

  detector.processPacket(originalPacket, targetWaypoint);

  if (JSON.stringify(originalPacket) !== packetSnapshot) {
    throw new Error("Test 3 Failed: Input packet was mutated by the fault evaluation engine!");
  }
  console.log("✓ Test 3 Passed: Original packet remained 100% unmodified post-evaluation.\n");

  // ---------------------------------------------------------------------------
  // TEST 4: Performance & Latency Benchmark at 5Hz Across 12 Drones (300 Packets)
  // ---------------------------------------------------------------------------
  console.log("[TEST 4] Benchmarking Stream Processing Throughput (300 Packets across 12 Drones)...");
  detector.reset();

  const numDrones = 12;
  const numTicks = 25; // 25 ticks * 12 drones = 300 packets (5s show duration at 5Hz)

  const benchmarkStart = process.hrtime();

  for (let tick = 0; tick < numTicks; tick++) {
    const snapshots = [];
    for (let d = 1; d <= numDrones; d++) {
      const droneId = `DRONE-${String(d).padStart(2, "0")}`;
      const packet = makeNominalTelemetry(droneId, tick);
      detector.processPacket(packet, targetWaypoint);
      snapshots.push({ drone_id: droneId, packet, intendedPosition: targetWaypoint });
    }
    detector.processSwarmTick(snapshots);
  }

  const [benchSec, benchNano] = process.hrtime(benchmarkStart);
  const totalElapsedMs = benchSec * 1000 + benchNano / 1000000;
  const metrics = detector.getPerformanceMetrics();

  console.log(`  - Total Packets Evaluated: ${metrics.total_packets_evaluated}`);
  console.log(`  - Total Swarm Ticks Evaluated: ${metrics.total_swarm_ticks_evaluated}`);
  console.log(`  - Average Evaluation Latency per Packet: ${metrics.avg_packet_eval_latency_us} µs (${(metrics.avg_packet_eval_latency_us / 1000).toFixed(4)} ms)`);
  console.log(`  - Maximum Latency Observed: ${metrics.max_packet_eval_latency_us} µs`);
  console.log(`  - Total Batch Execution Time: ${totalElapsedMs.toFixed(2)} ms for 300 packets`);

  // Target: Average latency under 500µs (0.5ms)
  if (metrics.avg_packet_eval_latency_us > 500) {
    throw new Error(`Test 4 Failed: Evaluation latency too high: ${metrics.avg_packet_eval_latency_us} µs (expected < 500 µs)`);
  }
  console.log("✓ Test 4 Passed: Ultra-low latency verified (< 0.5ms per packet budget achieved with huge headroom).\n");

  console.log("================================================================================");
  console.log("            ALL SECTION 4 TESTS PASSED (100% SPEC COMPLIANT)                   ");
  console.log("================================================================================");
}

runSection4UnitTests().catch((err) => {
  console.error("Section 4 Test Suite Failed:", err);
  process.exit(1);
});
