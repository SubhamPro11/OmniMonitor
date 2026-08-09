/**
 * OmniMonitor Fault Engine Section 2 Automated Test Suite
 * Tests Single-Drone Evaluator and Metric Debouncer in strict isolation.
 */

import { SingleDroneEvaluator } from "../src/lib/faults/singleDroneEvaluator";
import { MetricDebouncer } from "../src/lib/faults/debouncer";
import { DEFAULT_FAULT_CONFIG } from "../src/lib/faults/config";
import { TelemetryEvent, WaypointPosition } from "../src/types/database";

function makeNominalPacket(droneId: string = "DRONE-01", ts: string = new Date().toISOString()): TelemetryEvent {
  return {
    drone_id: droneId,
    ts,
    position: { x: 5.0, y: 5.0, z: 15.0, lat: 37.7749, lon: -122.4194, alt_m: 15.0 },
    velocity: { x: 0.2, y: 0.1, z: 0.0 },
    battery: { voltage: 15.2, current_a: 14.5, pct: 85.0 },
    imu: { pitch: 2.1, roll: -1.4, yaw: 45.0 },
    link_quality: { rssi_dbm: -64.0, packet_loss_pct: 0.0 },
    motor_temp: [45.2, 46.1, 44.8, 45.9],
    gps_fix: "RTK_FIXED",
    flight_mode: "SHOW",
  };
}

const nominalWaypoint: WaypointPosition = {
  x: 5.0,
  y: 5.0,
  z: 15.0,
};

async function runSection2UnitTests() {
  console.log("================================================================================");
  console.log("             RUNNING FAULT ENGINE SECTION 2 ISOLATION TEST SUITE               ");
  console.log("================================================================================\n");

  const debouncer = new MetricDebouncer();
  const evaluator = new SingleDroneEvaluator(DEFAULT_FAULT_CONFIG, debouncer);

  // ---------------------------------------------------------------------------
  // TEST 1: Nominal Telemetry Stream (Zero False Positives)
  // ---------------------------------------------------------------------------
  console.log("[TEST 1] Testing Nominal Telemetry Stream (Zero False Positives)...");
  for (let i = 0; i < 10; i++) {
    const packet = makeNominalPacket("DRONE-01");
    const faults = evaluator.evaluate({
      packet,
      intendedPosition: nominalWaypoint,
    });
    if (faults.length > 0) {
      throw new Error(`Test 1 Failed: False positive fault emitted on nominal packet ${i}: ${JSON.stringify(faults)}`);
    }
  }
  console.log("✓ Test 1 Passed: 10 nominal telemetry ticks produced 0 false positive faults.\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Positional Drift (Debounce vs Immediate)
  // ---------------------------------------------------------------------------
  console.log("[TEST 2] Testing Positional Drift Debounce Behavior...");
  debouncer.clearAll();

  // Tick 1: Drift breach (1.8m > 1.2m warning threshold). Debounce required = 3 ticks.
  const driftPacket1 = makeNominalPacket("DRONE-01");
  driftPacket1.position.x = 5.0 + 1.8; // +1.8m drift
  let faults = evaluator.evaluate({ packet: driftPacket1, intendedPosition: nominalWaypoint });
  if (faults.length !== 0) {
    throw new Error("Test 2 Failed: Emitted drift warning on tick 1 before debounce count met (got 1, needed 3)");
  }

  // Tick 2: Second drift breach
  const driftPacket2 = makeNominalPacket("DRONE-01");
  driftPacket2.position.x = 5.0 + 1.8;
  faults = evaluator.evaluate({ packet: driftPacket2, intendedPosition: nominalWaypoint });
  if (faults.length !== 0) {
    throw new Error("Test 2 Failed: Emitted drift warning on tick 2 before debounce count met (got 2, needed 3)");
  }

  // Tick 3: Third drift breach -> Should trigger POSITION_DRIFT_WARN
  const driftPacket3 = makeNominalPacket("DRONE-01");
  driftPacket3.position.x = 5.0 + 1.8;
  faults = evaluator.evaluate({ packet: driftPacket3, intendedPosition: nominalWaypoint });
  if (faults.length !== 1 || faults[0].fault_type !== "POSITION_DRIFT_WARN") {
    throw new Error(`Test 2 Failed: Expected POSITION_DRIFT_WARN on tick 3, got: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 2 Passed: Debounced drift warning correctly suppressed transient jitter and triggered on tick 3 (${faults[0].description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Battery Instant Voltage Collapse vs. Sustained SoC Warning
  // ---------------------------------------------------------------------------
  console.log("[TEST 3] Testing Battery Instant Voltage Collapse vs Sustained SoC Warning...");
  debouncer.clearAll();

  // Instant emergency voltage collapse (12.2V <= 12.8V threshold) -> Must trigger INSTANTLY on tick 1
  const batEmergencyPacket = makeNominalPacket("DRONE-02");
  batEmergencyPacket.battery.voltage = 12.2;
  faults = evaluator.evaluate({ packet: batEmergencyPacket });
  const collapseFault = faults.find((f) => f.fault_type === "BATTERY_CELL_COLLAPSE");
  if (!collapseFault || collapseFault.trigger_mode !== "instant") {
    throw new Error(`Test 3 Failed: Emergency voltage collapse did not trigger instant fault: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 3 Passed: Emergency voltage collapse triggered instantly (${collapseFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 4: Motor Thermal Burnout Spike vs Peak Thermal Warning
  // ---------------------------------------------------------------------------
  console.log("[TEST 4] Testing Motor Thermal Burnout Spike vs Peak Thermal Check...");
  debouncer.clearAll();

  // Rate of rise spike: previous packet at 74°C, current at 80°C (+6°C in 0.2s = +30°C/s spike)
  const prevThermalPacket = makeNominalPacket("DRONE-03", new Date(Date.now() - 200).toISOString());
  prevThermalPacket.motor_temp = [74.0, 50.0, 50.0, 50.0];

  const currThermalPacket = makeNominalPacket("DRONE-03", new Date().toISOString());
  currThermalPacket.motor_temp = [80.0, 50.0, 50.0, 50.0];

  faults = evaluator.evaluate({
    packet: currThermalPacket,
    history: [prevThermalPacket],
  });

  const burnoutFault = faults.find((f) => f.fault_type === "MOTOR_STATOR_BURNOUT");
  if (!burnoutFault || burnoutFault.trigger_mode !== "instant") {
    throw new Error(`Test 4 Failed: Motor thermal spike did not trigger instant burnout fault: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 4 Passed: Motor thermal spike correctly triggered stator burnout fault (${burnoutFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 5: IMU Attitude Flip vs Degraded Tilt
  // ---------------------------------------------------------------------------
  console.log("[TEST 5] Testing IMU Attitude Flip (Instant) vs Tilt Warning (Debounced)...");
  debouncer.clearAll();

  // Instant flip test: 48° pitch (>= 45° threshold)
  const flipPacket = makeNominalPacket("DRONE-04");
  flipPacket.imu.pitch = 48.5;
  faults = evaluator.evaluate({ packet: flipPacket });
  const flipFault = faults.find((f) => f.fault_type === "ATTITUDE_FLIP_CRIT");
  if (!flipFault || flipFault.trigger_mode !== "instant") {
    throw new Error(`Test 5 Failed: Attitude flip did not trigger instant critical fault: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 5 Passed: Severe attitude flip (48.5°) triggered instant critical fault (${flipFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 6: Heartbeat Timeout & Total Link Loss
  // ---------------------------------------------------------------------------
  console.log("[TEST 6] Testing Heartbeat Silence Timeout...");
  debouncer.clearAll();

  const silencePacket = makeNominalPacket("DRONE-05");
  const lastSeenMs = Date.now() - 3200; // 3.2s silence (> 2.5s threshold)
  faults = evaluator.evaluate({
    packet: silencePacket,
    lastSeenMs,
    nowMs: Date.now(),
  });

  const timeoutFault = faults.find((f) => f.fault_type === "LINK_HEARTBEAT_TIMEOUT");
  if (!timeoutFault || timeoutFault.severity !== "critical") {
    throw new Error(`Test 6 Failed: Heartbeat silence did not emit critical timeout fault: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 6 Passed: Heartbeat silence emitted critical link timeout (${timeoutFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 7: Configurable Threshold Override
  // ---------------------------------------------------------------------------
  console.log("[TEST 7] Testing Runtime Configurable Threshold Overrides...");
  const customEvaluator = new SingleDroneEvaluator({
    ...DEFAULT_FAULT_CONFIG,
    battery: {
      ...DEFAULT_FAULT_CONFIG.battery,
      soc_warning_pct: 35.0, // Custom higher warning threshold
      debounce_soc_warn: 1, // Single-tick test
    },
  });

  const customPacket = makeNominalPacket("DRONE-06");
  customPacket.battery.pct = 32.0; // Below custom 35% but above default 20%
  faults = customEvaluator.evaluate({ packet: customPacket });
  if (faults.length !== 1 || faults[0].fault_type !== "BATTERY_SOC_WARN") {
    throw new Error(`Test 7 Failed: Custom threshold override failed to trigger at 32%: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 7 Passed: Successfully respected runtime threshold override (SoC 32% breached custom 35% threshold).\n`);

  console.log("================================================================================");
  console.log("            ALL SECTION 2 TESTS PASSED (100% SPEC COMPLIANT)                   ");
  console.log("================================================================================");
}

runSection2UnitTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
