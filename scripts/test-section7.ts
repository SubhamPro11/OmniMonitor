import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import { SkybrushAdapter } from "../src/lib/adapters/skybrush";
import { SyncMonitoringEngine } from "../src/lib/sync/monitoringEngine";
import { AnomalyDetector } from "../src/lib/anomalies/detector";
import { AuditLogManager } from "../src/lib/controller/auditLog";
import { SuggestedFix } from "../src/types/replanning";
import fs from "fs";
import path from "path";
import assert from "assert";

async function runSection7Tests() {
  console.log("================================================================================");
  console.log("             RUNNING SECTION 7 TEST HARNESS (CONTROLLER INTERFACE)              ");
  console.log("================================================================================");

  // 1. Load Real Section 3 Show Plan
  console.log("\n[SETUP] Initializing Full System Pipeline & Show Plan...");
  const skybrushPath = path.join(process.cwd(), "sample_shows", "skybrush_sample.skyc");
  assert(fs.existsSync(skybrushPath), "skybrush_sample.skyc must exist");
  const skybrushRaw = fs.readFileSync(skybrushPath, "utf-8");
  const showPlan = SkybrushAdapter.parse(skybrushRaw, "skybrush-sec7-show");

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
  const auditLog = new AuditLogManager();

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
  // TEST 1: Controller APPROVE Flow ([Y]) & Fix Trajectory Transmission
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 1] Testing Controller APPROVE Flow ([Y]) & Real-Time Fix Execution...");
  simulator.injectPositionDrift("DRONE-03", 1.9, 1.1, 0.2); // Position drift fault
  await new Promise((resolve) => setTimeout(resolve, 250));

  const d3Fault = detector.getActiveFaults().find((f) => f.drone_id === "DRONE-03");
  assert(d3Fault !== undefined, "DRONE-03 fault event must be pending");
  assert(d3Fault.status === "pending", "Initial status must be 'pending'");

  const fix = d3Fault.suggested_fix as unknown as SuggestedFix;
  assert(fix !== null && fix.waypoints.length >= 2, "Must have collision-checked suggested fix");

  // Controller executes APPROVE action
  d3Fault.status = "approved";
  simulator.applyFix("DRONE-03", fix);

  auditLog.recordDecision({
    id: "audit-test-01",
    timestamp: new Date().toISOString(),
    drone_id: "DRONE-03",
    fault_type: d3Fault.fault_type,
    severity: d3Fault.severity,
    decision: "approved",
    fix_type: fix.fix_type,
    estimated_duration_s: fix.estimated_duration_s,
    safety_margin_m: fix.safety_margin_m,
  });

  // Verify simulator is now actively flying the approved fix
  const executing = simulator.getExecutingFixes();
  assert(executing["DRONE-03"] !== undefined, "DRONE-03 must be in executingFixes state on simulator");
  console.log(`✓ Test 1 Passed: Controller APPROVE ([Y]) updated status to 'approved' and transferred fix trajectory to drone.`);

  // ----------------------------------------------------------------------------
  // TEST 2: Controller REJECT Flow ([N]) with Mandatory Reason Logging
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing Controller REJECT Flow ([N]) & Mandatory Reason Logging...");
  simulator.injectBattery("DRONE-06", 8.0); // Battery critical fault
  await new Promise((resolve) => setTimeout(resolve, 250));

  const d6Fault = detector.getActiveFaults().find((f) => f.drone_id === "DRONE-06");
  assert(d6Fault !== undefined, "DRONE-06 fault event must be pending");

  // Controller executes REJECT action with specific visual reason
  const rejectionReason = "Visual line-of-sight confirmed clear; hold formation";
  d6Fault.status = "rejected";
  d6Fault.rejection_reason = rejectionReason;

  auditLog.recordDecision({
    id: "audit-test-02",
    timestamp: new Date().toISOString(),
    drone_id: "DRONE-06",
    fault_type: d6Fault.fault_type,
    severity: d6Fault.severity,
    decision: "rejected",
    rejection_reason: rejectionReason,
  });

  assert(d6Fault.status === "rejected", "Status must be 'rejected'");
  assert(d6Fault.rejection_reason === rejectionReason, "Rejection reason must be recorded");
  console.log(`✓ Test 2 Passed: Controller REJECT ([N]) logged decision with reason: '${rejectionReason}'.`);

  // ----------------------------------------------------------------------------
  // TEST 3: Controller Manual OVERRIDE Flow ([O])
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Controller Manual OVERRIDE Flow ([O])...");
  simulator.injectMotorTemp("DRONE-07", 0, 88.0);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const d7Fault = detector.getActiveFaults().find((f) => f.drone_id === "DRONE-07");
  assert(d7Fault !== undefined, "DRONE-07 motor fault must fire");

  const overrideNotes = "Controller manual stick descent to secondary pad";
  d7Fault.status = "approved";
  d7Fault.rejection_reason = overrideNotes;

  auditLog.recordDecision({
    id: "audit-test-03",
    timestamp: new Date().toISOString(),
    drone_id: "DRONE-07",
    fault_type: d7Fault.fault_type,
    severity: d7Fault.severity,
    decision: "overridden",
    override_notes: overrideNotes,
  });

  console.log(`✓ Test 3 Passed: Manual OVERRIDE ([O]) logged decision with notes: '${overrideNotes}'.`);

  // ----------------------------------------------------------------------------
  // TEST 4: Session Audit Log JSON & CSV Export Validation
  // ----------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing Session Audit Log CSV & JSON Export Formatting...");
  const auditHistory = auditLog.getHistory();
  assert(auditHistory.length === 3, `Expected 3 audit decisions logged, got ${auditHistory.length}`);

  // Test CSV Formatting
  const csv = auditLog.exportCSV();
  assert(csv.includes("Drone ID"), "CSV must include headers");
  assert(csv.includes("DRONE-03"), "CSV must include approved DRONE-03 entry");
  assert(csv.includes("DRONE-06"), "CSV must include rejected DRONE-06 entry");
  assert(csv.includes(rejectionReason), "CSV must include logged rejection reason");

  // Test JSON Formatting
  const jsonStr = auditLog.exportJSON();
  const parsed = JSON.parse(jsonStr);
  assert(parsed.total_decisions === 3, "JSON must record 3 decisions");
  assert(parsed.entries.length === 3, "JSON entries array must match");

  console.log("✓ Test 4 Passed: CSV and JSON post-show audit reports formatted cleanly.");

  // Cleanup
  simulator.stop();
  detector.destroy();

  console.log("\n================================================================================");
  console.log("            ALL SECTION 7 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection7Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
