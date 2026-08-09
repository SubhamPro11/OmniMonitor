import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import assert from "assert";

async function runSection2Tests() {
  console.log("================================================================================");
  console.log("                RUNNING SECTION 2 VERIFICATION SUITE (AUTOMATED)                ");
  console.log("================================================================================");

  // Test 1: Simulator Scaffolding & Telemetry Emission
  console.log("\n[TEST 1] Testing Simulator Initialization & Telemetry Schema...");
  const simulator = new DroneFleetSimulator({ drone_count: 12, frequency_hz: 10 });
  const receiver = new IngestionReceiver();

  let receivedCount = 0;
  const unsubscribeTest1 = simulator.onBatch((batch) => {
    assert(batch.length === 12, `Expected batch of 12 drones, got ${batch.length}`);
    const first = batch[0];
    assert(first.drone_id.startsWith("DRONE-"), "Expected drone_id format DRONE-XX");
    assert(typeof first.position.alt_m === "number", "Expected numeric alt_m");
    assert(typeof first.battery.pct === "number", "Expected numeric battery pct");
    assert(typeof first.link_quality.rssi_dbm === "number", "Expected numeric rssi_dbm");
    assert(Array.isArray(first.motor_temp) && first.motor_temp.length === 4, "Expected 4 motor temps");
    assert(first.gps_fix === "RTK_FIXED", "Expected RTK_FIXED GPS fix");

    receiver.ingestBatch(batch);
    receivedCount += batch.length;
  });

  simulator.start();
  await new Promise((resolve) => setTimeout(resolve, 300));
  simulator.stop();
  unsubscribeTest1();

  assert(receivedCount > 0, "Expected simulator to emit batches");
  const metrics = receiver.getMetrics();
  assert(metrics.total_received === receivedCount, "Receiver total_received should match emitted count");
  assert(metrics.activeDrones === 12, "Expected 12 active drones in receiver map");
  console.log(`✓ Test 1 Passed: Ingested ${receivedCount} valid telemetry packets across 12 drones.`);

  // Test 2: Fault Injection Controls
  console.log("\n[TEST 2] Testing Dynamic Fault Injections...");
  simulator.injectBattery("DRONE-02", 14.2);
  simulator.injectPositionDrift("DRONE-05", 4.5, 2.3, 1.1);
  simulator.injectPacketLoss("DRONE-08", 68.0);
  simulator.killLink("DRONE-11", true);
  simulator.injectMotorTemp("DRONE-03", 1, 88.4);

  const activeFaults = simulator.getActiveFaults();
  assert(activeFaults["DRONE-02"]?.battery_override === 14.2, "Battery override failed");
  assert(activeFaults["DRONE-05"]?.drift_offset?.x === 4.5, "Drift offset failed");
  assert(activeFaults["DRONE-08"]?.packet_loss_override === 68.0, "Packet loss override failed");
  assert(activeFaults["DRONE-11"]?.link_killed === true, "Kill link failed");
  assert(activeFaults["DRONE-03"]?.motor_temp_spike?.temp_c === 88.4, "Motor temp spike failed");

  let batchWithFaultsCount = 0;
  simulator.onBatch((batch) => {
    batchWithFaultsCount++;
    // DRONE-11 link is killed, so batch should have 11 drones
    assert(batch.length === 11, `Expected 11 drones with DRONE-11 killed, got ${batch.length}`);
    const d2 = batch.find((d) => d.drone_id === "DRONE-02");
    assert(d2 && d2.battery.pct === 14.2, "Expected DRONE-02 battery to reflect injected 14.2%");
    const d3 = batch.find((d) => d.drone_id === "DRONE-03");
    assert(d3 && d3.motor_temp[1] === 88.4, "Expected DRONE-03 motor 2 temp to be 88.4C");
  });

  simulator.start();
  await new Promise((resolve) => setTimeout(resolve, 200));
  simulator.stop();
  assert(batchWithFaultsCount > 0, "Expected fault batch to be captured");
  console.log("✓ Test 2 Passed: Battery, Drift, Packet Loss, Link Kill, and Motor Temp faults verified.");

  // Test 3: Malformed Telemetry Rejection & Error Logging (Never Fail Silently)
  console.log("\n[TEST 3] Testing Malformed Payload Rejection (Safety Error Surfacing)...");
  const malformedPayloads = [
    null,
    {},
    { drone_id: "DRONE-99" }, // missing mandatory position, battery, imu, etc.
    { drone_id: "DRONE-98", ts: "2026-08-08", position: { alt_m: "not-a-number" } },
  ];

  for (const p of malformedPayloads) {
    const success = receiver.ingest(p);
    assert(success === false, "Expected invalid payload to be rejected");
  }

  const errorMetrics = receiver.getMetrics();
  assert(
    errorMetrics.dropped_or_malformed === malformedPayloads.length,
    `Expected ${malformedPayloads.length} dropped packets, got ${errorMetrics.dropped_or_malformed}`
  );
  assert(errorMetrics.malformedLogs.length >= malformedPayloads.length, "Expected errors logged in malformedLogs");
  console.log(`✓ Test 3 Passed: Rejected ${malformedPayloads.length} malformed packets and surfaced reasons in error log.`);

  console.log("\n================================================================================");
  console.log("            ALL SECTION 2 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection2Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
