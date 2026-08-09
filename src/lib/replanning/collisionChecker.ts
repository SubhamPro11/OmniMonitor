import { NormalizedShowPlan } from "@/types/showPlan";
import { CollisionCheckResult, CollisionConflict, FixWaypoint } from "@/types/replanning";
import { TrajectoryInterpolator } from "../sync/interpolator";

export class CollisionChecker {
  /**
   * Validates a candidate trajectory against all other drones' predicted 3D flight paths.
   * Checks both show waypoints and any other currently executing emergency fixes.
   */
  public static checkTrajectory(
    candidateWaypoints: FixWaypoint[],
    targetDroneId: string,
    startTimeMs: number,
    safetyMarginM: number = 2.0,
    showPlan: NormalizedShowPlan | null = null,
    otherActiveFixes: Map<string, FixWaypoint[]> = new Map()
  ): CollisionCheckResult {
    if (candidateWaypoints.length < 2) {
      return { is_safe: true, min_separation_m: 999, conflicts: [] };
    }

    const durationMs = candidateWaypoints[candidateWaypoints.length - 1].t_offset_ms;
    const sampleStepMs = 100; // Sample every 100ms for high temporal fidelity
    const conflicts: CollisionConflict[] = [];
    let minSeparationM = 999.0;

    // Get list of all other drones
    const allDroneIds: string[] = [];
    if (showPlan) {
      Object.keys(showPlan.waypoints_by_drone).forEach((id) => {
        if (id !== targetDroneId) allDroneIds.push(id);
      });
    } else {
      // Fallback 12 drones
      for (let i = 1; i <= 12; i++) {
        const id = `DRONE-${String(i).padStart(2, "0")}`;
        if (id !== targetDroneId) allDroneIds.push(id);
      }
    }

    for (let tRel = 0; tRel <= durationMs; tRel += sampleStepMs) {
      const tAbs = startTimeMs + tRel;
      const candPos = this.sampleCandidatePosition(candidateWaypoints, tRel);

      for (const otherId of allDroneIds) {
        let otherPos: [number, number, number] | null = null;

        // Check if other drone has an active emergency trajectory
        const otherFix = otherActiveFixes.get(otherId);
        if (otherFix && otherFix.length >= 2) {
          otherPos = this.sampleCandidatePosition(otherFix, tRel);
        } else if (showPlan && showPlan.waypoints_by_drone[otherId]) {
          const tShow = tAbs % (showPlan.duration_ms || 60000);
          const interp = TrajectoryInterpolator.interpolateDrone(
            showPlan.waypoints_by_drone[otherId],
            tShow
          );
          if (interp) {
            otherPos = [
              interp.position.x ?? 0,
              interp.position.y ?? 0,
              interp.position.z ?? interp.position.alt_m ?? 20,
            ];
          }
        }

        if (otherPos) {
          const dx = candPos[0] - otherPos[0];
          const dy = candPos[1] - otherPos[1];
          const dz = candPos[2] - otherPos[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < minSeparationM) {
            minSeparationM = Number(dist.toFixed(3));
          }

          if (dist < safetyMarginM) {
            conflicts.push({
              drone_id: otherId,
              t_ms: tRel,
              distance_m: Number(dist.toFixed(3)),
              candidate_position: candPos,
              conflicting_drone_position: otherPos,
            });
          }
        }
      }
    }

    return {
      is_safe: conflicts.length === 0,
      min_separation_m: minSeparationM,
      conflicts,
    };
  }

  private static sampleCandidatePosition(
    waypoints: FixWaypoint[],
    tRelMs: number
  ): [number, number, number] {
    if (waypoints.length === 0) return [0, 0, 0];
    if (tRelMs <= waypoints[0].t_offset_ms) {
      return [waypoints[0].x, waypoints[0].y, waypoints[0].z];
    }
    if (tRelMs >= waypoints[waypoints.length - 1].t_offset_ms) {
      const last = waypoints[waypoints.length - 1];
      return [last.x, last.y, last.z];
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
      const w0 = waypoints[i];
      const w1 = waypoints[i + 1];
      if (tRelMs >= w0.t_offset_ms && tRelMs <= w1.t_offset_ms) {
        const segDuration = w1.t_offset_ms - w0.t_offset_ms;
        const alpha = segDuration > 0 ? (tRelMs - w0.t_offset_ms) / segDuration : 0;
        return [
          w0.x + alpha * (w1.x - w0.x),
          w0.y + alpha * (w1.y - w0.y),
          w0.z + alpha * (w1.z - w0.z),
        ];
      }
    }

    const last = waypoints[waypoints.length - 1];
    return [last.x, last.y, last.z];
  }
}
