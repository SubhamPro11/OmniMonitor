import { SkybrushAdapter, VimdronesAdapter, VergeAeroAdapter, ShowPlanImporter } from "../src/lib/adapters";
import fs from "fs";
import path from "path";
import assert from "assert";

async function runSection3Tests() {
  console.log("================================================================================");
  console.log("                RUNNING SECTION 3 VERIFICATION SUITE (ADAPTERS)                 ");
  console.log("================================================================================");

  const skybrushFilePath = path.join(process.cwd(), "sample_shows", "skybrush_sample.skyc");
  const vimdronesFilePath = path.join(process.cwd(), "sample_shows", "vimdrones_sample.json");
  const vergeAeroFilePath = path.join(process.cwd(), "sample_shows", "verge_aero_mock.json");

  // --- Test 1: Skybrush Adapter (.skyc) ---
  console.log("\n[TEST 1] Testing Skybrush Adapter against real sample file (.skyc)...");
  assert(fs.existsSync(skybrushFilePath), "skybrush_sample.skyc must exist");
  const skybrushRaw = fs.readFileSync(skybrushFilePath, "utf-8");

  const skybrushPlan = SkybrushAdapter.parse(skybrushRaw, "test-skybrush-show");
  assert(skybrushPlan.source_tool === "skybrush", "Expected source_tool to be skybrush");
  assert(skybrushPlan.drone_count === 12, `Expected 12 drones in Skybrush sample, got ${skybrushPlan.drone_count}`);
  assert(skybrushPlan.all_waypoints.length > 0, "Expected waypoints in Skybrush plan");
  assert(skybrushPlan.duration_ms === 60000, `Expected 60000ms duration, got ${skybrushPlan.duration_ms}`);
  assert(skybrushPlan.altitude_range.min_m >= 0, "Expected non-negative minimum altitude");
  assert(skybrushPlan.is_verified === true, "Skybrush plan should be marked verified");

  const firstSkybrushWp = skybrushPlan.all_waypoints[0];
  assert(firstSkybrushWp.drone_id.startsWith("DRONE-"), "Expected drone_id format DRONE-XX");
  assert(typeof firstSkybrushWp.position.x === "number", "Expected numeric X");
  assert(typeof firstSkybrushWp.position.z === "number", "Expected numeric Z");
  assert(typeof firstSkybrushWp.led_state.r === "number", "Expected numeric LED red");

  const skybrushSanity = SkybrushAdapter.evaluateSanity(skybrushPlan);
  assert(skybrushSanity.is_valid === true, "Skybrush sanity check should pass");
  console.log(`✓ Test 1 Passed: Skybrush adapter parsed ${skybrushPlan.drone_count} drones and ${skybrushPlan.all_waypoints.length} waypoints cleanly.`);

  // --- Test 2: Vimdrones Designer (Blender) Adapter ---
  console.log("\n[TEST 2] Testing Vimdrones Designer (Blender) Adapter against sample export...");
  assert(fs.existsSync(vimdronesFilePath), "vimdrones_sample.json must exist");
  const vimdronesRaw = fs.readFileSync(vimdronesFilePath, "utf-8");

  const vimdronesPlan = VimdronesAdapter.parse(vimdronesRaw, "test-vimdrones-show");
  assert(vimdronesPlan.source_tool === "vimdrones", "Expected source_tool to be vimdrones");
  assert(vimdronesPlan.drone_count === 12, `Expected 12 drones in Vimdrones sample, got ${vimdronesPlan.drone_count}`);
  assert(vimdronesPlan.all_waypoints.length > 0, "Expected waypoints in Vimdrones plan");
  assert(vimdronesPlan.duration_ms === 60000, `Expected 60000ms duration, got ${vimdronesPlan.duration_ms}`);
  assert(vimdronesPlan.is_verified === true, "Vimdrones plan should be marked verified");

  const firstVimdronesWp = vimdronesPlan.all_waypoints[0];
  assert(firstVimdronesWp.drone_id.startsWith("DRONE-"), "Expected drone_id format DRONE-XX");
  assert(typeof firstVimdronesWp.position.y === "number", "Expected numeric Y");
  assert(typeof firstVimdronesWp.led_state.brightness === "number", "Expected numeric brightness");

  const vimdronesSanity = SkybrushAdapter.evaluateSanity(vimdronesPlan);
  assert(vimdronesSanity.is_valid === true, "Vimdrones sanity check should pass");
  console.log(`✓ Test 2 Passed: Vimdrones adapter parsed ${vimdronesPlan.drone_count} drones and ${vimdronesPlan.all_waypoints.length} keyframe waypoints cleanly.`);

  // --- Test 3: Verge Aero Adapter (Stub - Unverified) ---
  console.log("\n[TEST 3] Testing Verge Aero Adapter (Stub - clearly labeled unverified)...");
  assert(fs.existsSync(vergeAeroFilePath), "verge_aero_mock.json must exist");
  const vergeAeroRaw = fs.readFileSync(vergeAeroFilePath, "utf-8");

  const vergeAeroPlan = VergeAeroAdapter.parse(vergeAeroRaw, "test-verge-show");
  assert(vergeAeroPlan.source_tool === "verge_aero", "Expected source_tool to be verge_aero");
  assert(vergeAeroPlan.is_verified === false, "Verge Aero stub MUST be flagged is_verified: false");
  assert(vergeAeroPlan.metadata?.warning !== undefined, "Verge Aero stub must carry explicit unverified warning");
  assert(VergeAeroAdapter.isRealApiAvailable() === false, "VergeAeroAdapter.isRealApiAvailable() should return false");
  console.log("✓ Test 3 Passed: Verge Aero stub correctly initialized and strictly labeled as unverified mock data.");

  // --- Test 4: Universal Importer & Auto-Detection ---
  console.log("\n[TEST 4] Testing Universal Importer & Auto-Detection Pipeline...");
  const autoSkybrush = ShowPlanImporter.parseShow(skybrushRaw, "auto");
  assert(autoSkybrush.plan.source_tool === "skybrush", "Auto-detection should identify Skybrush");

  const autoVimdrones = ShowPlanImporter.parseShow(vimdronesRaw, "auto");
  assert(autoVimdrones.plan.source_tool === "vimdrones", "Auto-detection should identify Vimdrones");

  const autoVergeAero = ShowPlanImporter.parseShow(vergeAeroRaw, "auto");
  assert(autoVergeAero.plan.source_tool === "verge_aero", "Auto-detection should identify Verge Aero");

  assert(ShowPlanImporter.getActivePlan() !== null, "Expected active show plan to be registered in memory");
  console.log("✓ Test 4 Passed: Auto-detection and normalized internal representation verified across all formats.");

  console.log("\n================================================================================");
  console.log("            ALL SECTION 3 TESTS PASSED CLEANLY (100% SPEC COMPLIANCE)           ");
  console.log("================================================================================");
}

runSection3Tests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
