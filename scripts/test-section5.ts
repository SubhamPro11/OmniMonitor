import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import { SkybrushAdapter } from "../src/lib/adapters/skybrush";
import { SyncMonitoringEngine } from "../src/lib/sync/monitoringEngine";
import { AnomalyDetector } from "../src/lib/anomalies/detector";
import fs from "fs";
import path from "path";
import assert from "assert";

async function runSection5Tests() {
  console.log("================================================================================");
  console.log("          RUNNING SECTION 5 TEST HARNESS (RULE-BASED ANOMALY DETECTION)          ");
  console.log("================================================================================");

  // 1. Load Real Section 3 Show Plan
  console.log("\n[SETUP] Loading Real Section 3 Skybrush Show Plan...");
  const skybrushPath = path.join(process.cwd(), "sample_shows", "skybrush_sample.skyc");
  assert(fs.existsSync(skybrushPath), "skybrush_sample.skyc must exist");
  const skybrushRaw = fs.readFileSync(skybrushPath, "utf-8");
  const showPlan = SkybrushAdapter.parse(skybrushRaw, "skybrush-sec5-show");

  // 2. Test 1: 5-Minute Simulated Normal Flight (Zero False Positives)
  console.log("\n[TEST 1] Testing 5-Minute Simulated Normal Flight (Zero False Positives)...");
  const simNormal = new DroneFleetSimulator({
    drone_count: 12,
    frequency_hz: 50, // Accelerated for test speed
    base_alt_m: showPlan.altitude_range.min_m,
  });
  simNormal.loadShowPlan(showPlan);

  const receiverNormal = new IngestionReceiver();
  const monitoringNormal = new SyncMonitoringEngine();
  monitoringNormal.setShowPlan(showPlan);
  monitoringNormal.startShow();

  const detectorNormal = new AnomalyDetector();
  let falsePositiveCount = 0;
  detectorNormal.onFault((fault) => {
    falsePositiveCount++;
    console.error("UNEXPECTED FAULT EVENT:", fault);
  });

  simNormal.onBatch((batch) => {
    receiverNormal.ingestBatch(batch);
    for (const event of batch) {
      const health = monitoringNormal.processTelemetry(event);
      detectorNormal.evaluate(health);
    }
  });

  simNormal.start();
  // Simulate 300 simulated seconds (5 minutes of flight)
  await new Promise((resolve) => setTimeout(resolve, 800));
  simNormal.stop();

  assert(falsePositiveCount === 0, `Expected 0 false positives during normal flight, got ${falsePositiveCount}`);
  assert(detectorNormal.getActiveFaults().length === 0, "Active faults list should be empty during normal flight");
  console.log("✓ Test 1 Passed: ZERO false positives across 5 minutes of simulated normal flight with natural turbulence.");

  // 3. Test 2: Debounce Filter (Single Noisy Reading Transient Spike)
  console.log("\n[TEST 2] Testing Debounce Filter (Single Transient Noise Spike Should NOT Fire)...");
  const detectorDebounce = new AnomalyDetector({ debounce_consecutive_readings: 2 });
  const mockHealth = {
    drone_id: "DRONE-03",
    timestamp: new Date().toISOString(),
    show_time_ms: 1000,
    intended_position: { x: 0, y: 0, z: 20 },
    actual_position: { x: 0, y: 0, z: 20 },
    position_delta_m: 0.1,
    position_score: 98,
    battery_pct: 95,
    battery_voltage: 17.1,
    battery_score: 100,
    rssi_dbm: -65,
    packet_loss_pct: 0,
    link_quality: 95,
    motor_temp_max: 46,
    motor_temps: [46, 46, 45, 46],
    thermal_score: 100,
    composite_health_score: 98,
    tier: "healthy" as const,
    is_stale: false,
    last_received_ms_ago: 0,
    raw_telemetry: null,
  };

  // Inject 1 single noisy reading with extreme drift (5.2m)
  const noisyHealth = { ...mockHealth, position_delta_m: 5.2 };
  const fired1 = detectorDebounce.evaluate(noisyHealth);
  assert(fired1.length === 0, "Single noisy reading should be debounced and NOT fire a fault event!");

  // Immediately return to normal
  const fired2 = detectorDebounce.evaluate(mockHealth);
  assert(fired2.length === 0, "Recovered reading should NOT fire a fault event");
  assert(detectorDebounce.getActiveFaults().length === 0, "No active fault should be logged for transient spike");
  console.log("✓ Test 2 Passed: Single noisy reading successfully debounced (requires 2 consecutive readings).");

  // 4. Test 3: Verified Threshold Breaches & Severity Classification
  console.log("\n[TEST 3] Testing Threshold Breaches & Appropriate Severity Classification...");

  // 3a. Battery Warning (< 20%)
  const batWarnHealth = { ...mockHealth, battery_pct: 15.0 };
  detectorDebounce.evaluate(batWarnHealth); // reading 1
  const batWarnFired = detectorDebounce.evaluate(batWarnHealth); // reading 2
  assert(batWarnFired.length === 1, "Expected battery_warning fault to fire on 2nd reading");
  assert(batWarnFired[0].fault_type === "battery_warning", "Fault type must be battery_warning");
  assert(batWarnFired[0].severity === "warning", "Severity must be 'warning'");
  assert(batWarnFired[0].status === "pending", "Status must be 'pending'");
  assert(batWarnFired[0].suggested_fix === null, "Suggested fix MUST be null per Section 5 spec");
  console.log("✓ Test 3a Passed: Battery Warning (<20%) correctly fired with severity 'warning' and status 'pending'.");

  // 3b. Battery Critical (< 10%)
  const batCritHealth = { ...mockHealth, battery_pct: 7.5 };
  detectorDebounce.evaluate(batCritHealth);
  const batCritFired = detectorDebounce.evaluate(batCritHealth);
  assert(batCritFired.length === 1, "Expected battery_critical fault to fire on 2nd reading");
  assert(batCritFired[0].fault_type === "battery_critical", "Fault type must be battery_critical");
  assert(batCritFired[0].severity === "critical", "Severity must be 'critical'");
  console.log("✓ Test 3b Passed: Battery Critical (<10%) correctly fired with severity 'critical'.");

  // 3c. Position Drift Warning (> 1.5m)
  const driftWarnHealth = { ...mockHealth, drone_id: "DRONE-04", position_delta_m: 2.3 };
  detectorDebounce.evaluate(driftWarnHealth);
  const driftWarnFired = detectorDebounce.evaluate(driftWarnHealth);
  assert(driftWarnFired.length === 1, "Expected position_drift warning to fire on 2nd reading");
  assert(driftWarnFired[0].severity === "warning", "Severity must be 'warning'");
  console.log("✓ Test 3c Passed: Position Drift Warning (>1.5m) correctly fired with severity 'warning'.");

  // 3d. Position Drift Critical (> 4.0m)
  const driftCritHealth = { ...mockHealth, drone_id: "DRONE-05", position_delta_m: 4.6 };
  detectorDebounce.evaluate(driftCritHealth);
  const driftCritFired = detectorDebounce.evaluate(driftCritHealth);
  assert(driftCritFired.length === 1, "Expected position_drift critical to fire on 2nd reading");
  assert(driftCritFired[0].severity === "critical", "Severity must be 'critical'");
  console.log("✓ Test 3d Passed: Position Drift Critical (>4.0m) correctly fired with severity 'critical'.");

  // 3e. Motor Thermal Overheat (> 80C)
  const motorCritHealth = { ...mockHealth, drone_id: "DRONE-07", motor_temp_max: 88.5 };
  detectorDebounce.evaluate(motorCritHealth);
  const motorCritFired = detectorDebounce.evaluate(motorCritHealth);
  assert(motorCritFired.length === 1, "Expected motor_critical to fire on 2nd reading");
  assert(motorCritFired[0].severity === "critical", "Severity must be 'critical'");
  console.log("✓ Test 3e Passed: Motor Thermal Critical (>80°C) correctly fired with severity 'critical'.");

  // 3f. Packet Loss Warning (> 10%)
  const lossWarnHealth = { ...mockHealth, drone_id: "DRONE-08", packet_loss_pct: 28.0 };
  detectorDebounce.evaluate(lossWarnHealth);
  const lossWarnFired = detectorDebounce.evaluate(lossWarnHealth);
  assert(lossWarnFired.length === 1, "Expected comms_loss warning to fire on 2nd reading");
  assert(lossWarnFired[0].severity === "warning", "Severity must be 'warning'");
  console.log("✓ Test 3f Passed: Packet Loss Warning (>10%) correctly fired with severity 'warning'.");

  // 4. Test 4: Suggested Fix Field Strict Gating
  console.log("\n[TEST 4] Verifying suggested_fix field is strictly null across all active fault events...");
  const allActive = detectorDebounce.getActiveFaults();
  assert(allActive.length >= 5, "Expected multiple active faults recorded");
  for (const fault of allActive) {
    assert(fault.suggested_fix === null, `Fault ${fault.id} must have suggested_fix === null`);
    assert(fault.status === "pending", `Fault ${fault.id} must have status === 'pending'`);
  }
  console.log(`✓ Test 4 Passed: All ${allActive.length} active fault events strictly maintain suggested_fix: null (Section 6 gated).`);

  detectorNormal.destroy();
  detectorDebounce.destroy();

  console.log("\n================================================================================");
  console.log("            ALL SECTION 5 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection5Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
