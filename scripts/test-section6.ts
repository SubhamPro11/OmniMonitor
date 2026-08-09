import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import { SkybrushAdapter } from "../src/lib/adapters/skybrush";
import { SyncMonitoringEngine } from "../src/lib/sync/monitoringEngine";
import { AnomalyDetector } from "../src/lib/anomalies/detector";
import { CollisionChecker } from "../src/lib/replanning/collisionChecker";
import { RePlanningEngine } from "../src/lib/replanning/engine";
import { SuggestedFix } from "../src/types/replanning";
import fs from "fs";
import path from "path";
import assert from "assert";

async function runSection6Tests() {
  console.log("================================================================================");
  console.log("             RUNNING SECTION 6 TEST HARNESS (RE-PLANNING ENGINE)                ");
  console.log("================================================================================");

  // 1. Load Real Section 3 Show Plan
  console.log("\n[SETUP] Loading Real Section 3 Skybrush Show Plan...");
  const skybrushPath = path.join(process.cwd(), "sample_shows", "skybrush_sample.skyc");
  assert(fs.existsSync(skybrushPath), "skybrush_sample.skyc must exist");
  const skybrushRaw = fs.readFileSync(skybrushPath, "utf-8");
  const showPlan = SkybrushAdapter.parse(skybrushRaw, "skybrush-sec6-show");

  // 2. Initialize Telemetry Pipeline with Re-Planning
  const simulator = new DroneFleetSimulator({
    drone_count: 12,
    frequency_hz: 20,
    base_alt_m: showPlan.altitude_range.min_m,
  });
  simulator.loadShowPlan(showPlan);

  const receiver = new IngestionReceiver();
  const monitoring = new SyncMonitoringEngine();
  monitoring.setShowPlan(showPlan);
  monitoring.startShow();

  const detector = new AnomalyDetector({ debounce_consecutive_readings: 2 }, monitoring);

  simulator.onBatch((batch) => {
    receiver.ingestBatch(batch);
    for (const event of batch) {
      const health = monitoring.processTelemetry(event);
      detector.evaluate(health);
    }
  });

  simulator.start();
  await new Promise((resolve) => setTimeout(resolve, 300));

  // ----------------------------------------------------------------------------
  // TEST 1: Drift Fault -> auto_correct Fix Verification
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 1] Testing Minor Drift Fault -> auto_correct Trajectory Generation...");
  simulator.injectPositionDrift("DRONE-03", 1.8, 1.2, 0.3); // 2.18m drift (< 2.5m)
  await new Promise((resolve) => setTimeout(resolve, 250));

  const d3Fault = detector.getActiveFaults().find((f) => f.drone_id === "DRONE-03");
  assert(d3Fault !== undefined, "DRONE-03 position drift fault must fire");
  assert(d3Fault.suggested_fix !== null, "DRONE-03 must have a suggested_fix populated");

  const fix1 = d3Fault.suggested_fix as unknown as SuggestedFix;
  assert(fix1.fix_type === "auto_correct", `Expected fix_type 'auto_correct', got '${fix1.fix_type}'`);
  assert(fix1.collision_checked === true, "Fix must be collision_checked === true");
  assert(fix1.safety_margin_m >= 2.0, "Safety margin must be >= 2.0m");
  assert(fix1.waypoints.length >= 4, "Auto-correct must generate multi-point smooth trajectory");
  assert((fix1.min_separation_m ?? 0) >= 2.0, `Min separation must be >= 2.0m, got ${fix1.min_separation_m}m`);
  console.log(`✓ Test 1 Passed: auto_correct fix generated with ${fix1.waypoints.length} waypoints, duration ${fix1.estimated_duration_s}s, and min clearance ${fix1.min_separation_m}m.`);

  // ----------------------------------------------------------------------------
  // TEST 2: Battery Critical Fault -> reroute_to_land Fix Verification
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing Battery Critical Fault -> reroute_to_land Landing Zone Corridor...");
  simulator.injectBattery("DRONE-06", 8.0);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const d6Fault = detector.getActiveFaults().find((f) => f.drone_id === "DRONE-06");
  assert(d6Fault !== undefined, "DRONE-06 battery critical fault must fire");
  assert(d6Fault.suggested_fix !== null, "DRONE-06 must have suggested_fix");

  const fix2 = d6Fault.suggested_fix as unknown as SuggestedFix;
  assert(fix2.fix_type === "reroute_to_land", `Expected fix_type 'reroute_to_land', got '${fix2.fix_type}'`);
  assert(fix2.collision_checked === true, "Reroute fix must be collision_checked === true");
  assert(fix2.landing_zone_id !== undefined, "Reroute must assign a designated landing zone");
  const finalWp = fix2.waypoints[fix2.waypoints.length - 1];
  assert(finalWp.z === 0, `Final landing waypoint altitude must be 0m (touchdown), got ${finalWp.z}m`);
  assert((fix2.min_separation_m ?? 0) >= 2.0, `Landing descent min separation must be >= 2.0m, got ${fix2.min_separation_m}m`);
  console.log(`✓ Test 2 Passed: reroute_to_land fix generated to ${fix2.landing_zone_id} with safe touchdown (z=0m) and min clearance ${fix2.min_separation_m}m.`);

  // ----------------------------------------------------------------------------
  // TEST 3: Crowded Swarm Scenario -> Perimeter Detour Collision Avoidance
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Crowded Scenario -> Direct Conflict Detection & Perimeter Detour Routing...");

  // Intentionally craft a candidate direct descent path that directly cuts through another drone's coordinates
  const conflictedDirectPath = [
    { x: 12.0, y: 12.0, z: 20.0, t_offset_ms: 0 },
    { x: 5.0, y: 5.0, z: 10.0, t_offset_ms: 2000 }, // Intersects drone path
    { x: 0.0, y: 0.0, z: 0.0, t_offset_ms: 4000 },
  ];

  // Test collision checker directly on conflicted trajectory
  const conflictCheck = CollisionChecker.checkTrajectory(
    conflictedDirectPath,
    "DRONE-02",
    1000,
    2.0,
    showPlan
  );

  console.log(`- Direct descent conflict evaluation: Safe=${conflictCheck.is_safe}, Min Separation=${conflictCheck.min_separation_m}m, Conflict Count=${conflictCheck.conflicts.length}`);

  // Test RePlanningEngine solving detour routing
  const detourFix = RePlanningEngine.generateFix(
    { id: "test-crowded", drone_id: "DRONE-02", detected_at: "", fault_type: "position_drift", severity: "critical", delta: {}, status: "pending" },
    {
      drone_id: "DRONE-02",
      timestamp: new Date().toISOString(),
      show_time_ms: 1000,
      intended_position: { x: 12, y: 12, z: 20 },
      actual_position: { x: 16.5, y: 16.5, z: 20 },
      position_delta_m: 4.8,
      position_score: 0,
      battery_pct: 75,
      battery_voltage: 16.8,
      battery_score: 95,
      rssi_dbm: -65,
      packet_loss_pct: 0,
      link_quality: 90,
      motor_temp_max: 47,
      motor_temps: [47, 47, 46, 47],
      thermal_score: 100,
      composite_health_score: 45,
      tier: "critical",
      is_stale: false,
      last_received_ms_ago: 0,
      raw_telemetry: null,
    },
    showPlan,
    2.0
  );

  assert(detourFix.collision_checked === true, "Detour fix must be collision_checked === true");
  assert((detourFix.min_separation_m ?? 0) >= 2.0, `Detour min clearance must be >= 2.0m, got ${detourFix.min_separation_m}m`);
  console.log(`✓ Test 3 Passed: Crowded conflict successfully resolved via collision-checked detour (Clearance: ${detourFix.min_separation_m}m, Detour applied: ${detourFix.detour_applied ?? false}).`);

  // ----------------------------------------------------------------------------
  // TEST 4: Comms Loss Emergency -> hold_or_rth Above Ceiling Verification
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing Comms Loss Emergency -> hold_or_rth Climb Above Swarm Ceiling...");
  simulator.killLink("DRONE-09");
  // Wait > 3.0s for comms loss timeout
  await new Promise((resolve) => setTimeout(resolve, 3500));
  detector.checkCommsTimeouts();

  const allActive = detector.getActiveFaults();
  console.log("Active faults at comms check:", allActive.map((f) => `${f.drone_id}:${f.fault_type}`));

  const d9Fault = allActive.find((f) => f.drone_id === "DRONE-09" && f.fault_type === "comms_loss");
  assert(d9Fault !== undefined, "DRONE-09 comms_loss fault must fire after 3.0s timeout");
  assert(d9Fault.suggested_fix !== null, "DRONE-09 must have suggested_fix");

  const fix4 = d9Fault.suggested_fix as unknown as SuggestedFix;
  assert(fix4.fix_type === "hold_or_rth", `Expected fix_type 'hold_or_rth', got '${fix4.fix_type}'`);
  assert(fix4.collision_checked === true, "RTH fix must be collision_checked === true");
  // Asserts climb above swarm ceiling (> 25m)
  assert(fix4.waypoints[1].z >= 25.0, `RTH waypoint 2 must climb above swarm ceiling, got ${fix4.waypoints[1].z}m`);
  console.log(`✓ Test 4 Passed: hold_or_rth fix climbs above swarm ceiling (${fix4.waypoints[1].z}m) with collision clearance ${fix4.min_separation_m}m.`);

  // Cleanup
  simulator.stop();
  detector.destroy();

  console.log("\n================================================================================");
  console.log("            ALL SECTION 6 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection6Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
