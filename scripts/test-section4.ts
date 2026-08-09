import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import { SkybrushAdapter } from "../src/lib/adapters/skybrush";
import { SyncMonitoringEngine } from "../src/lib/sync/monitoringEngine";
import fs from "fs";
import path from "path";
import assert from "assert";

async function runSection4Tests() {
  console.log("================================================================================");
  console.log("           RUNNING SECTION 4 TEST HARNESS (SYNC & HEALTH MONITORING)            ");
  console.log("================================================================================");

  // 1. Load Real Section 3 Show Plan
  console.log("\n[SETUP] Loading Real Section 3 Skybrush Show Plan...");
  const skybrushPath = path.join(process.cwd(), "sample_shows", "skybrush_sample.skyc");
  assert(fs.existsSync(skybrushPath), "skybrush_sample.skyc must exist");
  const skybrushRaw = fs.readFileSync(skybrushPath, "utf-8");
  const showPlan = SkybrushAdapter.parse(skybrushRaw, "skybrush-harness-show");
  assert(showPlan.drone_count === 12, "Expected 12 drones in show plan");

  // 2. Initialize Simulator & Monitoring Engine matching show plan coordinates
  const simulator = new DroneFleetSimulator({
    drone_count: 12,
    frequency_hz: 10,
    base_alt_m: showPlan.altitude_range.min_m, // 20.0m
  });
  simulator.loadShowPlan(showPlan);

  const receiver = new IngestionReceiver();
  const monitoring = new SyncMonitoringEngine();
  monitoring.setShowPlan(showPlan);
  monitoring.startShow();

  // Wire pipeline
  simulator.onBatch((batch) => {
    receiver.ingestBatch(batch);
    for (const event of batch) {
      monitoring.processTelemetry(event);
    }
  });

  simulator.start();

  console.log("\n[TEST 1] Verifying Nominal Baseline Health Scores (No Injected Faults)...");
  await new Promise((resolve) => setTimeout(resolve, 500));

  const baselineSnapshot = monitoring.getFleetSnapshot();
  assert(baselineSnapshot.total_drones === 12, `Expected 12 active drones, got ${baselineSnapshot.total_drones}`);
  assert(baselineSnapshot.healthy_count >= 10, `Expected at least 10 healthy drones, got ${baselineSnapshot.healthy_count}`);

  const d2Initial = monitoring.getDroneHealth("DRONE-02");
  assert(d2Initial !== null, "DRONE-02 health must exist");
  assert(d2Initial.composite_health_score >= 80, `DRONE-02 baseline score should be >= 80, got ${d2Initial.composite_health_score}`);
  assert(d2Initial.tier === "healthy", "Baseline tier should be 'healthy'");
  console.log(`✓ Test 1 Passed: Nominal baseline score is ${d2Initial.composite_health_score} / 100 (Tier: Healthy, ${baselineSnapshot.healthy_count} drones healthy).`);

  // 4. Test Harness: Sub-second Health Drop upon Battery Fault
  console.log("\n[TEST 2] Injecting Battery Drop (12%) on DRONE-02 — Verifying < 1s Reaction...");
  const tFaultInject = Date.now();
  simulator.injectBattery("DRONE-02", 12.0);

  // Poll every 50ms to measure reaction latency
  let faultObserved = false;
  let reactionLatencyMs = 0;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const h = monitoring.getDroneHealth("DRONE-02");
    if (h && h.battery_pct <= 15.0 && h.composite_health_score < 78) {
      reactionLatencyMs = Date.now() - tFaultInject;
      faultObserved = true;
      assert(reactionLatencyMs < 1000, `Health score drop took ${reactionLatencyMs}ms — MUST be < 1000ms!`);
      assert(h.tier !== "healthy", "Tier must downgrade from healthy");
      break;
    }
  }

  assert(faultObserved, "Expected DRONE-02 health score to drop below 78 within 1 second");
  console.log(`✓ Test 2 Passed: DRONE-02 health score dropped to ${monitoring.getDroneHealth("DRONE-02")?.composite_health_score} in ${reactionLatencyMs}ms (< 1000ms requirement met).`);

  // 5. Test Harness: Position Drift Fault
  console.log("\n[TEST 3] Injecting Position Drift (+4.5m) on DRONE-05...");
  const tDriftInject = Date.now();
  simulator.injectPositionDrift("DRONE-05", 4.5, 2.5, 1.0);

  let driftObserved = false;
  let driftLatencyMs = 0;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const h = monitoring.getDroneHealth("DRONE-05");
    if (h && h.position_delta_m >= 3.0 && h.position_score <= 40) {
      driftLatencyMs = Date.now() - tDriftInject;
      driftObserved = true;
      assert(driftLatencyMs < 1000, `Drift reaction took ${driftLatencyMs}ms — MUST be < 1000ms!`);
      break;
    }
  }

  assert(driftObserved, "Expected DRONE-05 position delta >= 3.0m within 1 second");
  const d5Final = monitoring.getDroneHealth("DRONE-05");
  console.log(`✓ Test 3 Passed: DRONE-05 drift delta measured at ${d5Final?.position_delta_m}m with score ${d5Final?.composite_health_score} in ${driftLatencyMs}ms.`);

  // 6. Test Harness: Motor Thermal Spike
  console.log("\n[TEST 4] Injecting Motor Thermal Spike (89.5°C) on DRONE-07...");
  const tTempInject = Date.now();
  simulator.injectMotorTemp("DRONE-07", 0, 89.5);

  let tempObserved = false;
  let tempLatencyMs = 0;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const h = monitoring.getDroneHealth("DRONE-07");
    if (h && h.motor_temp_max >= 85.0 && h.thermal_score <= 20) {
      tempLatencyMs = Date.now() - tTempInject;
      tempObserved = true;
      assert(tempLatencyMs < 1000, `Thermal reaction took ${tempLatencyMs}ms — MUST be < 1000ms!`);
      break;
    }
  }

  assert(tempObserved, "Expected DRONE-07 thermal score drop within 1 second");
  console.log(`✓ Test 4 Passed: DRONE-07 motor max temp recorded at ${monitoring.getDroneHealth("DRONE-07")?.motor_temp_max}°C with thermal score ${monitoring.getDroneHealth("DRONE-07")?.thermal_score} in ${tempLatencyMs}ms.`);

  // 7. Cleanup
  simulator.stop();

  console.log("\n================================================================================");
  console.log("            ALL SECTION 4 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection4Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
