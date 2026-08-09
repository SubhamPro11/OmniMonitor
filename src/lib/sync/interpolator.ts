import { NormalizedShowPlan } from "@/types/showPlan";
import { ShowWaypoint, WaypointPosition, WaypointLedState } from "@/types/database";

export interface InterpolatedState {
  drone_id: string;
  t_offset_ms: number;
  position: WaypointPosition;
  led_state: WaypointLedState;
}

/**
 * Trajectory Interpolator (Section 4.1)
 * Given a loaded NormalizedShowPlan and the current show timeline offset (t_show_ms),
 * interpolates the exact intended 3D position and LED state for each drone.
 */
export class TrajectoryInterpolator {
  public static interpolateDrone(
    waypoints: ShowWaypoint[],
    t_offset_ms: number
  ): InterpolatedState | null {
    if (!waypoints || waypoints.length === 0) return null;

    const droneId = waypoints[0].drone_id;

    // Boundary cases: before first waypoint or after last waypoint
    if (t_offset_ms <= waypoints[0].t_offset_ms) {
      const first = waypoints[0];
      return {
        drone_id: droneId,
        t_offset_ms,
        position: { ...first.position },
        led_state: { ...first.led_state },
      };
    }

    const last = waypoints[waypoints.length - 1];
    if (t_offset_ms >= last.t_offset_ms) {
      return {
        drone_id: droneId,
        t_offset_ms,
        position: { ...last.position },
        led_state: { ...last.led_state },
      };
    }

    // Binary / linear search for surrounding keyframes [W_k, W_k+1]
    let prev = waypoints[0];
    let next = waypoints[waypoints.length - 1];

    for (let i = 0; i < waypoints.length - 1; i++) {
      if (waypoints[i].t_offset_ms <= t_offset_ms && waypoints[i + 1].t_offset_ms > t_offset_ms) {
        prev = waypoints[i];
        next = waypoints[i + 1];
        break;
      }
    }

    const duration = next.t_offset_ms - prev.t_offset_ms;
    const alpha = duration > 0 ? (t_offset_ms - prev.t_offset_ms) / duration : 0;

    // Linear spatial interpolation between waypoint 3D positions
    const px0 = prev.position.x ?? 0;
    const py0 = prev.position.y ?? 0;
    const pz0 = prev.position.z ?? prev.position.alt_m ?? 0;

    const px1 = next.position.x ?? 0;
    const py1 = next.position.y ?? 0;
    const pz1 = next.position.z ?? next.position.alt_m ?? 0;

    const x = Number((px0 + alpha * (px1 - px0)).toFixed(3));
    const y = Number((py0 + alpha * (py1 - py0)).toFixed(3));
    const z = Number((pz0 + alpha * (pz1 - pz0)).toFixed(3));

    // Optional GPS interpolation if available
    let lat: number | undefined;
    let lon: number | undefined;
    let alt_m: number | undefined;

    if (prev.position.lat !== undefined && next.position.lat !== undefined) {
      lat = Number((prev.position.lat + alpha * (next.position.lat - prev.position.lat)).toFixed(7));
    }
    if (prev.position.lon !== undefined && next.position.lon !== undefined) {
      lon = Number((prev.position.lon + alpha * (next.position.lon - prev.position.lon)).toFixed(7));
    }
    if (prev.position.alt_m !== undefined && next.position.alt_m !== undefined) {
      alt_m = Number((prev.position.alt_m + alpha * (next.position.alt_m - prev.position.alt_m)).toFixed(2));
    }

    // Color RGB linear interpolation
    const r = Math.round((prev.led_state.r ?? 255) + alpha * ((next.led_state.r ?? 255) - (prev.led_state.r ?? 255)));
    const g = Math.round((prev.led_state.g ?? 255) + alpha * ((next.led_state.g ?? 255) - (prev.led_state.g ?? 255)));
    const b = Math.round((prev.led_state.b ?? 255) + alpha * ((next.led_state.b ?? 255) - (prev.led_state.b ?? 255)));
    const brightness = Math.round(
      (prev.led_state.brightness ?? 100) + alpha * ((next.led_state.brightness ?? 100) - (prev.led_state.brightness ?? 100))
    );

    return {
      drone_id: droneId,
      t_offset_ms,
      position: {
        x,
        y,
        z,
        lat,
        lon,
        alt_m: alt_m ?? z,
      },
      led_state: {
        r,
        g,
        b,
        brightness,
      },
    };
  }

  public static interpolateFleet(
    plan: NormalizedShowPlan,
    t_offset_ms: number
  ): Map<string, InterpolatedState> {
    const results = new Map<string, InterpolatedState>();

    for (const droneId of plan.drones) {
      const waypoints = plan.waypoints_by_drone[droneId] || [];
      const state = this.interpolateDrone(waypoints, t_offset_ms);
      if (state) {
        results.set(droneId, state);
      }
    }

    return results;
  }
}
