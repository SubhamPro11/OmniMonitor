/**
 * OmniMonitor Fault Engine Section 5 Automated Test Suite
 * Tests Cockpit UI Event Payload Handoff, Session Audit Ledger, and CSV Export.
 */

import { SessionFaultLedger, mapPayloadToCockpitEvent } from "../src/lib/faults/cockpitAdapter";
import { SAMPLE_FAULT_STREAM_CONTRACT } from "../src/app/api/faults/stream/route";

async function runSection5UnitTests() {
  console.log("================================================================================");
  console.log("             RUNNING FAULT ENGINE SECTION 5 HANDOFF TEST SUITE                 ");
  console.log("================================================================================\n");

  const ledger = new SessionFaultLedger();

  // ---------------------------------------------------------------------------
  // TEST 1: Cockpit UI Event Contract Mapping
  // ---------------------------------------------------------------------------
  console.log("[TEST 1] Testing Payload Mapping to Cockpit UI Event Contract...");
  for (const rawPayload of SAMPLE_FAULT_STREAM_CONTRACT) {
    const cockpitEvent = mapPayloadToCockpitEvent(rawPayload);

    // Verify required database / cockpit contract fields
    if (!cockpitEvent.id || typeof cockpitEvent.id !== "string") {
      throw new Error(`Test 1 Failed: Missing or invalid 'id' in mapped event`);
    }
    if (!cockpitEvent.drone_id || typeof cockpitEvent.drone_id !== "string") {
      throw new Error(`Test 1 Failed: Missing or invalid 'drone_id' in mapped event`);
    }
    if (!cockpitEvent.detected_at || typeof cockpitEvent.detected_at !== "string") {
      throw new Error(`Test 1 Failed: Missing or invalid 'detected_at' in mapped event`);
    }
    if (!cockpitEvent.fault_type || typeof cockpitEvent.fault_type !== "string") {
      throw new Error(`Test 1 Failed: Missing or invalid 'fault_type' in mapped event`);
    }
    if (!cockpitEvent.severity || (cockpitEvent.severity !== "warning" && cockpitEvent.severity !== "critical")) {
      throw new Error(`Test 1 Failed: Invalid 'severity' in mapped event: ${cockpitEvent.severity}`);
    }
    if (!cockpitEvent.delta || typeof cockpitEvent.delta !== "object") {
      throw new Error(`Test 1 Failed: Missing 'delta' object for cockpit HUD rendering`);
    }
    if (cockpitEvent.status !== "pending") {
      throw new Error(`Test 1 Failed: Initial event status must be 'pending'`);
    }
  }
  console.log(`✓ Test 1 Passed: All ${SAMPLE_FAULT_STREAM_CONTRACT.length} sample payloads mapped cleanly to cockpit contract.\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Session Audit Ledger Recording & Retrieval
  // ---------------------------------------------------------------------------
  console.log("[TEST 2] Testing Session Audit Ledger Recording...");
  ledger.clear();

  const testFault = SAMPLE_FAULT_STREAM_CONTRACT[0];
  ledger.recordDetection(testFault);

  // Record operator approval action
  ledger.recordAction(
    testFault.id,
    testFault.drone_id,
    "operator_approved",
    "Operator accepted automatic peripheral land trajectory via key [Y]"
  );

  const records = ledger.getAuditRecords();
  if (records.length !== 2) {
    throw new Error(`Test 2 Failed: Expected 2 audit records, got ${records.length}`);
  }

  const [actionRecord, detectionRecord] = records;
  if (detectionRecord.action !== "detected" || detectionRecord.drone_id !== "DRONE-02") {
    throw new Error(`Test 2 Failed: Detection audit record mismatch: ${JSON.stringify(detectionRecord)}`);
  }
  if (actionRecord.action !== "operator_approved" || actionRecord.drone_id !== "DRONE-02") {
    throw new Error(`Test 2 Failed: Operator action audit record mismatch: ${JSON.stringify(actionRecord)}`);
  }
  console.log(`✓ Test 2 Passed: Audit ledger accurately recorded lifecycle (detection -> operator_approved).\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: CSV Audit Export Formatting
  // ---------------------------------------------------------------------------
  console.log("[TEST 3] Testing CSV Audit Log Export Formatting...");
  const csv = ledger.exportCsv();
  const lines = csv.trim().split("\n");

  if (lines.length !== 3) {
    // 1 header + 2 records
    throw new Error(`Test 3 Failed: CSV line count mismatch. Expected 3 lines, got ${lines.length}`);
  }
  if (!lines[0].includes("Audit ID") || !lines[0].includes("Timestamp") || !lines[0].includes("Details")) {
    throw new Error(`Test 3 Failed: CSV header corrupted: ${lines[0]}`);
  }
  console.log(`✓ Test 3 Passed: CSV export generated valid header and rows:\n${csv}\n`);

  console.log("================================================================================");
  console.log("            ALL SECTION 5 TESTS PASSED (100% SPEC COMPLIANT)                   ");
  console.log("================================================================================");
}

runSection5UnitTests().catch((err) => {
  console.error("Section 5 Test Suite Failed:", err);
  process.exit(1);
});
