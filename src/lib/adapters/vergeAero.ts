import { NormalizedShowPlan } from "@/types/showPlan";
import { ShowWaypoint } from "@/types/database";

/**
 * ==============================================================================
 * VERGE AERO ADAPTER — STUB IMPLEMENTATION (MOCK DATA ONLY — UNVERIFIED)
 * ==============================================================================
 * WARNING: Official Verge Aero API / proprietary export SDK access has NOT been
 * confirmed. This adapter is strictly a mock stub for architectural validation
 * and normalization testing. DO NOT USE WITH REAL HARDWARE UNTIL VERIFIED.
 * ==============================================================================
 */

export interface VergeAeroMockTrack {
  drone_index: number;
  label?: string;
  points?: Array<{ time_ms: number; x: number; y: number; z: number; color_hex?: string }>;
}

export class VergeAeroAdapter {
  public static isRealApiAvailable(): boolean {
    return false; // Explicitly unverified
  }

  public static parse(input: string | Record<string, unknown>, showId = "verge-aero-mock"): NormalizedShowPlan {
    console.warn(
      "[ADAPTER WARNING] Using UNVERIFIED Verge Aero STUB adapter. Real vendor API/SDK access is unconfirmed."
    );

    let droneCount = 12;
    let durationMs = 45000;
    let showName = "Verge Aero Mock Show (UNVERIFIED STUB)";

    if (typeof input === "string" && input.trim().length > 0) {
      try {
        const parsed = JSON.parse(input);
        if (parsed.drone_count) droneCount = parsed.drone_count;
        if (parsed.duration_ms) durationMs = parsed.duration_ms;
        if (parsed.name) showName = `${parsed.name} (UNVERIFIED)`;
      } catch {
        // Fall back to synthetic mock stub
      }
    }

    const waypointsByDrone: Record<string, ShowWaypoint[]> = {};
    const allWaypoints: ShowWaypoint[] = [];
    const droneIds: string[] = [];

    // Synthesize mock helical choreography
    const stepMs = 500;
    const totalSteps = Math.floor(durationMs / stepMs);

    for (let i = 1; i <= droneCount; i++) {
      const droneId = `DRONE-${String(i).padStart(2, "0")}`;
      droneIds.push(droneId);
      waypointsByDrone[droneId] = [];

      for (let s = 0; s <= totalSteps; s++) {
        const t_offset_ms = s * stepMs;
        const progress = s / totalSteps;
        const angle = progress * Math.PI * 4 + (i * Math.PI * 2) / droneCount;
        const radius = 12.0;

        const x = Number((radius * Math.cos(angle)).toFixed(2));
        const y = Number((radius * Math.sin(angle)).toFixed(2));
        const z = Number((20.0 + progress * 20.0 + (i % 3) * 2.0).toFixed(2));

        const waypoint: ShowWaypoint = {
          show_id: showId,
          drone_id: droneId,
          t_offset_ms,
          position: {
            x,
            y,
            z,
            alt_m: z,
          },
          led_state: {
            r: Math.round(128 + 127 * Math.sin(angle)),
            g: Math.round(128 + 127 * Math.cos(angle)),
            b: 255,
            brightness: 100,
          },
        };

        waypointsByDrone[droneId].push(waypoint);
        allWaypoints.push(waypoint);
      }
    }

    return {
      id: showId,
      name: showName,
      source_tool: "verge_aero",
      duration_ms: durationMs,
      drone_count: droneCount,
      altitude_range: {
        min_m: 20.0,
        max_m: 44.0,
      },
      spatial_bounds: {
        min_x: -12.0,
        max_x: 12.0,
        min_y: -12.0,
        max_y: 12.0,
        min_z: 20.0,
        max_z: 44.0,
      },
      drones: droneIds,
      waypoints_by_drone: waypointsByDrone,
      all_waypoints: allWaypoints,
      imported_at: new Date().toISOString(),
      metadata: {
        warning: "UNVERIFIED_STUB — Real Verge Aero API/SDK unconfirmed",
        is_mock: true,
      },
      is_verified: false, // Flagged clearly as unverified
    };
  }
}
