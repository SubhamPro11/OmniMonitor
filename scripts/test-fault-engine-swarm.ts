/**
 * OmniMonitor Fault Engine Section 3 Automated Test Suite
 * Tests Swarm-Level Cross-Drone Evaluator in strict isolation.
 */

import { SwarmEvaluator, DroneSwarmSnapshot } from "../src/lib/faults/swarmEvaluator";
import { MetricDebouncer } from "../src/lib/faults/debouncer";
import { DEFAULT_FAULT_CONFIG } from "../src/lib/faults/config";
import { TelemetryEvent, WaypointPosition } from "../src/types/database";

function makeNominalDrone(idNum: number, x: number, y: number, z: number = 15.0): DroneSwarmSnapshot {
  const droneId = `DRONE-${String(idNum).padStart(2, "0")}`;
  const packet: TelemetryEvent = {
    drone_id: droneId,
    ts: new Date().toISOString(),
    position: { x, y, z, lat: 37.7749, lon: -122.4194, alt_m: z },
    velocity: { x: 0.0, y: 0.0, z: 0.0 },
    battery: { voltage: 15.2, current_a: 14.5, pct: 85.0 },
    imu: { pitch: 0.0, roll: 0.0, yaw: 0.0 },
    link_quality: { rssi_dbm: -64.0, packet_loss_pct: 0.0 },
    motor_temp: [45.0, 45.0, 45.0, 45.0],
    gps_fix: "RTK_FIXED",
    flight_mode: "SHOW",
  };

  const intendedPosition: WaypointPosition = { x, y, z };
  return { drone_id: droneId, packet, intendedPosition };
}

async function runSection3UnitTests() {
  console.log("================================================================================");
  console.log("             RUNNING FAULT ENGINE SECTION 3 SWARM TEST SUITE                   ");
  console.log("================================================================================\n");

  const debouncer = new MetricDebouncer();
  const evaluator = new SwarmEvaluator(DEFAULT_FAULT_CONFIG, debouncer);

  // ---------------------------------------------------------------------------
  // TEST 1: Nominal 12-Drone Grid (Zero False Positives)
  // ---------------------------------------------------------------------------
  console.log("[TEST 1] Testing Nominal 12-Drone Swarm Formation (Zero False Positives)...");
  const nominalSwarm: DroneSwarmSnapshot[] = [];
  for (let i = 0; i < 12; i++) {
    // 3 rows x 4 cols with 4.0m separation
    const row = Math.floor(i / 4);
    const col = i % 4;
    nominalSwarm.push(makeNominalDrone(i + 1, col * 4.0, row * 4.0, 15.0));
  }

  let faults = evaluator.evaluate({ droneSnapshots: nominalSwarm });
  if (faults.length > 0) {
    throw new Error(`Test 1 Failed: False positive swarm fault emitted: ${JSON.stringify(faults)}`);
  }
  console.log("✓ Test 1 Passed: 12-drone nominal formation produced 0 cross-drone faults.\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Pairwise Emergency Collision Proximity (< 1.2m)
  // ---------------------------------------------------------------------------
  console.log("[TEST 2] Testing Pairwise Emergency Collision Proximity Detection (< 1.2m)...");
  debouncer.clearAll();

  const collisionSwarm = JSON.parse(JSON.stringify(nominalSwarm)) as DroneSwarmSnapshot[];
  // Move DRONE-02 dangerously close to DRONE-01 (0.8m distance)
  collisionSwarm[1].packet.position.x = 0.8;
  collisionSwarm[1].packet.position.y = 0.0;

  faults = evaluator.evaluate({ droneSnapshots: collisionSwarm });
  const collisionFault = faults.find((f) => f.fault_type === "COLLISION_PROXIMITY_CRIT");
  if (!collisionFault || collisionFault.trigger_mode !== "instant") {
    throw new Error(`Test 2 Failed: Emergency collision proximity did not trigger instant fault: ${JSON.stringify(faults)}`);
  }

  if (!collisionFault.involved_drone_ids?.includes("DRONE-01") || !collisionFault.involved_drone_ids?.includes("DRONE-02")) {
    throw new Error(`Test 2 Failed: Involved drones mismatch in collision fault: ${JSON.stringify(collisionFault.involved_drone_ids)}`);
  }
  console.log(`✓ Test 2 Passed: Instant collision fault triggered between DRONE-01 and DRONE-02 (${collisionFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Systemic Swarm-Wide RF Degradation (>= 35% of fleet)
  // ---------------------------------------------------------------------------
  console.log("[TEST 3] Testing Swarm-Wide RF Interference / Ground Station Loss (>= 35% Fleet)...");
  debouncer.clearAll();

  const rfDegradedSwarm = JSON.parse(JSON.stringify(nominalSwarm)) as DroneSwarmSnapshot[];
  // Degrade 5 of 12 drones (41.6% >= 35% threshold)
  for (let i = 0; i < 5; i++) {
    rfDegradedSwarm[i].packet.link_quality.packet_loss_pct = 28.0;
  }

  // Tick 1: Debounced
  faults = evaluator.evaluate({ droneSnapshots: rfDegradedSwarm });
  if (faults.some((f) => f.fault_type === "SWARM_LINK_DEGRADATION")) {
    throw new Error("Test 3 Failed: Swarm link fault triggered on tick 1 before debounce count met (2 needed)");
  }

  // Tick 2: Debounce satisfied -> Trigger SWARM_LINK_DEGRADATION
  faults = evaluator.evaluate({ droneSnapshots: rfDegradedSwarm });
  const rfFault = faults.find((f) => f.fault_type === "SWARM_LINK_DEGRADATION");
  if (!rfFault || rfFault.severity !== "critical") {
    throw new Error(`Test 3 Failed: Expected SWARM_LINK_DEGRADATION on tick 2, got: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 3 Passed: Systemic RF interference correctly identified across ${rfFault.involved_drone_ids?.length} drones (${rfFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 4: Correlated Multi-Drone Spatial Drift (Wind Shear vs. Single Rogue Drone)
  // ---------------------------------------------------------------------------
  console.log("[TEST 4] Testing Correlated Multi-Drone Spatial Drift (Systemic Wind Shear)...");
  debouncer.clearAll();

  const windSwarm = JSON.parse(JSON.stringify(nominalSwarm)) as DroneSwarmSnapshot[];
  // Drones 1, 2, 3, 4 all pushed eastward by localized wind (+1.6m in X, +0.1m in Y)
  for (let i = 0; i < 4; i++) {
    if (windSwarm[i].packet.position) {
      windSwarm[i].packet.position.x = (windSwarm[i].packet.position.x ?? 0) + 1.6;
      windSwarm[i].packet.position.y = (windSwarm[i].packet.position.y ?? 0) + 0.1;
    }
  }

  // Tick 1
  faults = evaluator.evaluate({ droneSnapshots: windSwarm });
  // Tick 2
  faults = evaluator.evaluate({ droneSnapshots: windSwarm });

  const windFault = faults.find((f) => f.fault_type === "SWARM_CORRELATED_DRIFT");
  if (!windFault || windFault.severity !== "warning") {
    throw new Error(`Test 4 Failed: Correlated drift failed to detect aligned wind shear: ${JSON.stringify(faults)}`);
  }
  console.log(`✓ Test 4 Passed: Correlated wind shear detected across ${windFault.involved_drone_ids?.length} drones (${windFault.description}).\n`);

  // ---------------------------------------------------------------------------
  // TEST 5: Single Rogue Drone Drift (Does NOT trigger Swarm Correlated Fault)
  // ---------------------------------------------------------------------------
  console.log("[TEST 5] Testing Single Rogue Drone Drift (Suppress Swarm Fault)...");
  debouncer.clearAll();

  const rogueSwarm = JSON.parse(JSON.stringify(nominalSwarm)) as DroneSwarmSnapshot[];
  // Only DRONE-01 drifts
  if (rogueSwarm[0].packet.position) {
    rogueSwarm[0].packet.position.x = (rogueSwarm[0].packet.position.x ?? 0) + 2.0;
  }

  faults = evaluator.evaluate({ droneSnapshots: rogueSwarm });
  faults = evaluator.evaluate({ droneSnapshots: rogueSwarm });

  const falseSwarmFault = faults.find((f) => f.fault_type === "SWARM_CORRELATED_DRIFT");
  if (falseSwarmFault) {
    throw new Error("Test 5 Failed: Single rogue drone incorrectly triggered swarm correlated drift fault.");
  }
  console.log("✓ Test 5 Passed: Single rogue drone correctly classified as local drone fault, NOT swarm correlated drift.\n");

  console.log("================================================================================");
  console.log("            ALL SECTION 3 TESTS PASSED (100% SPEC COMPLIANT)                   ");
  console.log("================================================================================");
}

runSection3UnitTests().catch((err) => {
  console.error("Section 3 Test Suite Failed:", err);
  process.exit(1);
});
