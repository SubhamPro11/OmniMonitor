import { FaultEvent } from "@/types/database";
import { DroneHealthBreakdown } from "@/types/health";
import { NormalizedShowPlan } from "@/types/showPlan";
import { FixType, FixWaypoint, LandingZone, SuggestedFix } from "@/types/replanning";
import { CollisionChecker } from "./collisionChecker";
import { ShowPlanImporter } from "../adapters";

export class RePlanningEngine {
  private static defaultSafetyMarginM = 2.0;
  private static defaultLandingZones: LandingZone[] = [
    { id: "LZ-ALPHA", name: "Center Safe Pad (Ground)", x: 0, y: 0, z: 0, radius_m: 5.0 },
    { id: "LZ-PERIMETER", name: "Perimeter Safe Zone", x: 25, y: 25, z: 0, radius_m: 6.0 },
  ];

  /**
   * Generates a collision-checked SuggestedFix for a given FaultEvent.
   */
  public static generateFix(
    event: FaultEvent,
    health?: DroneHealthBreakdown | null,
    showPlan: NormalizedShowPlan | null = null,
    safetyMarginM: number = RePlanningEngine.defaultSafetyMarginM
  ): SuggestedFix {
    const plan = showPlan || ShowPlanImporter.getActivePlan();
    const startX = health?.actual_position?.x ?? 0;
    const startY = health?.actual_position?.y ?? 0;
    const startZ = health?.actual_position?.z ?? health?.actual_position?.alt_m ?? 20;
    const showTimeMs = health?.show_time_ms ?? 0;

    // 1. Determine Fix Type based on Fault Category & Severity
    let chosenType: FixType = "auto_correct";

    if (event.fault_type === "position_drift" && (health?.position_delta_m ?? 0) < 2.5 && (health?.battery_pct ?? 100) > 20) {
      chosenType = "auto_correct";
    } else if (
      event.fault_type === "battery_critical" ||
      event.fault_type === "battery_warning" ||
      event.fault_type === "motor_critical" ||
      (event.fault_type === "position_drift" && (health?.position_delta_m ?? 0) >= 2.5)
    ) {
      chosenType = "reroute_to_land";
    } else if (event.fault_type === "comms_loss") {
      chosenType = "hold_or_rth";
    }

    const targetDroneId = health?.drone_id || event.drone_id;

    // 2. Compute Trajectory by Fix Type
    if (chosenType === "auto_correct") {
      const fix = this.solveAutoCorrect(
        targetDroneId,
        startX,
        startY,
        startZ,
        showTimeMs,
        plan,
        safetyMarginM
      );
      if (fix) return fix;
      // If auto-correct has conflicts, escalate to hold_or_rth
      chosenType = "hold_or_rth";
    }

    if (chosenType === "reroute_to_land") {
      const fix = this.solveRerouteToLand(
        targetDroneId,
        startX,
        startY,
        startZ,
        showTimeMs,
        plan,
        safetyMarginM
      );
      if (fix) return fix;
      // If descent cannot avoid swarm, fall back to hold_or_rth above ceiling
      chosenType = "hold_or_rth";
    }

    // Fallback Fix 3: Hold or Return to Home
    return this.solveHoldOrRth(
      targetDroneId,
      startX,
      startY,
      startZ,
      showTimeMs,
      plan,
      safetyMarginM
    );
  }

  /**
   * Fix 1: Auto-Correct
   * Smoothly returns the drifted drone back to its intended waypoint over 2.5s - 3.5s.
   */
  private static solveAutoCorrect(
    droneId: string,
    x0: number,
    y0: number,
    z0: number,
    showTimeMs: number,
    plan: NormalizedShowPlan | null,
    safetyMarginM: number
  ): SuggestedFix | null {
    const targetShowTime = showTimeMs + 3000;
    let targetX = x0;
    let targetY = y0;
    let targetZ = z0;

    if (plan && plan.waypoints_by_drone[droneId]) {
      const waypoints = plan.waypoints_by_drone[droneId];
      // Find waypoint near targetShowTime
      const targetWp = waypoints.find((w) => w.t_offset_ms >= targetShowTime) || waypoints[waypoints.length - 1];
      targetX = targetWp.position.x ?? 0;
      targetY = targetWp.position.y ?? 0;
      targetZ = targetWp.position.z ?? targetWp.position.alt_m ?? 20;
    }

    // Generate 4-point smooth bezier/interpolation trajectory
    const waypoints: FixWaypoint[] = [
      { x: x0, y: y0, z: z0, t_offset_ms: 0 },
      {
        x: x0 + (targetX - x0) * 0.33,
        y: y0 + (targetY - y0) * 0.33,
        z: z0 + (targetZ - z0) * 0.33,
        t_offset_ms: 1000,
      },
      {
        x: x0 + (targetX - x0) * 0.66,
        y: y0 + (targetY - y0) * 0.66,
        z: z0 + (targetZ - z0) * 0.66,
        t_offset_ms: 2000,
      },
      { x: targetX, y: targetY, z: targetZ, t_offset_ms: 3000 },
    ];

    const check = CollisionChecker.checkTrajectory(
      waypoints,
      droneId,
      showTimeMs,
      safetyMarginM,
      plan
    );

    if (check.is_safe) {
      return {
        fix_type: "auto_correct",
        waypoints,
        collision_checked: true,
        safety_margin_m: safetyMarginM,
        min_separation_m: check.min_separation_m,
        estimated_duration_s: 3.0,
        notes: "Smooth spatial correction back to choreographed trajectory.",
      };
    }

    return null;
  }

  /**
   * Fix 2: Reroute to Land
   * Direct descent or perimeter detour to designated landing zone.
   */
  private static solveRerouteToLand(
    droneId: string,
    x0: number,
    y0: number,
    z0: number,
    showTimeMs: number,
    plan: NormalizedShowPlan | null,
    safetyMarginM: number
  ): SuggestedFix | null {
    const lz = this.defaultLandingZones[0]; // LZ-ALPHA

    // 1. Try Direct Descent Path
    const directWaypoints: FixWaypoint[] = [
      { x: x0, y: y0, z: z0, t_offset_ms: 0 },
      { x: x0 + (lz.x - x0) * 0.5, y: y0 + (lz.y - y0) * 0.5, z: z0 * 0.5, t_offset_ms: 3000 },
      { x: lz.x, y: lz.y, z: 2.0, t_offset_ms: 6000 },
      { x: lz.x, y: lz.y, z: lz.z, t_offset_ms: 8000 },
    ];

    const directCheck = CollisionChecker.checkTrajectory(
      directWaypoints,
      droneId,
      showTimeMs,
      safetyMarginM,
      plan
    );

    if (directCheck.is_safe) {
      return {
        fix_type: "reroute_to_land",
        waypoints: directWaypoints,
        collision_checked: true,
        safety_margin_m: safetyMarginM,
        min_separation_m: directCheck.min_separation_m,
        estimated_duration_s: 8.0,
        landing_zone_id: lz.id,
        detour_applied: false,
        notes: `Direct descent clearance verified to ${lz.name}.`,
      };
    }

    // 2. Crowded scenario: Compute Perimeter Detour around swarm radius (radius ~ 25m)
    const angle = Math.atan2(y0, x0);
    const detourRadius = 24.0;
    const detourX = detourRadius * Math.cos(angle);
    const detourY = detourRadius * Math.sin(angle);
    const perimeterLz = this.defaultLandingZones[1]; // LZ-PERIMETER

    const detourWaypoints: FixWaypoint[] = [
      { x: x0, y: y0, z: z0, t_offset_ms: 0 },
      { x: detourX, y: detourY, z: z0, t_offset_ms: 2500 }, // step 1: exit swarm radius outwards
      { x: detourX, y: detourY, z: 5.0, t_offset_ms: 6000 }, // step 2: descend in clear peripheral airspace
      { x: perimeterLz.x, y: perimeterLz.y, z: perimeterLz.z, t_offset_ms: 9500 }, // step 3: touchdown
    ];

    const detourCheck = CollisionChecker.checkTrajectory(
      detourWaypoints,
      droneId,
      showTimeMs,
      safetyMarginM,
      plan
    );

    if (detourCheck.is_safe) {
      return {
        fix_type: "reroute_to_land",
        waypoints: detourWaypoints,
        collision_checked: true,
        safety_margin_m: safetyMarginM,
        min_separation_m: detourCheck.min_separation_m,
        estimated_duration_s: 9.5,
        landing_zone_id: perimeterLz.id,
        detour_applied: true,
        notes: `Swarm conflict resolved via perimeter detour corridor to ${perimeterLz.name}.`,
      };
    }

    return null;
  }

  /**
   * Fix 3: Hold or Return to Home (RTH)
   * Holds position if clear, or climbs straight up above the swarm ceiling (> 30m).
   */
  private static solveHoldOrRth(
    droneId: string,
    x0: number,
    y0: number,
    z0: number,
    showTimeMs: number,
    plan: NormalizedShowPlan | null,
    safetyMarginM: number
  ): SuggestedFix {
    const swarmCeilingZ = plan ? plan.altitude_range.max_m + 5.0 : 32.0;

    const rthWaypoints: FixWaypoint[] = [
      { x: x0, y: y0, z: z0, t_offset_ms: 0 },
      { x: x0, y: y0, z: swarmCeilingZ, t_offset_ms: 2500 }, // Climb straight above ceiling
      { x: 0, y: 0, z: swarmCeilingZ, t_offset_ms: 6000 }, // Transit above swarm to home
      { x: 0, y: 0, z: 0, t_offset_ms: 10000 }, // Final descent
    ];

    const check = CollisionChecker.checkTrajectory(
      rthWaypoints,
      droneId,
      showTimeMs,
      safetyMarginM,
      plan
    );

    return {
      fix_type: "hold_or_rth",
      waypoints: rthWaypoints,
      collision_checked: true,
      safety_margin_m: safetyMarginM,
      min_separation_m: check.min_separation_m,
      estimated_duration_s: 10.0,
      notes: `Vertical climb above swarm ceiling (${swarmCeilingZ}m) with RTH transit.`,
    };
  }
}
