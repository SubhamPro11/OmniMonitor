import { NormalizedShowPlan } from "@/types/showPlan";
import { ShowWaypoint } from "@/types/database";

export interface VimdronesKeyframe {
  t_offset_ms: number;
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
  brightness?: number;
}

export interface VimdronesDronePayload {
  drone_id: string;
  object_name?: string;
  keyframes: VimdronesKeyframe[];
}

export interface VimdronesRawShow {
  format?: string;
  version?: string;
  show_name?: string;
  frame_rate?: number;
  duration_ms?: number;
  drone_count?: number;
  drones: VimdronesDronePayload[];
  metadata?: Record<string, unknown>;
}

/**
 * Vimdrones Designer (Blender) Adapter (Section 3.2)
 * Reads JSON / CSV exports generated from the Blender choreography pipeline
 * and normalizes them into the standard ShowWaypoint schema.
 */
export class VimdronesAdapter {
  public static parse(input: string | Record<string, unknown>, showId = "vimdrones-show"): NormalizedShowPlan {
    let rawData: VimdronesRawShow;

    if (typeof input === "string") {
      try {
        rawData = JSON.parse(input) as VimdronesRawShow;
      } catch (err) {
        throw new Error(`Vimdrones parser error: Invalid JSON payload (${err})`);
      }
    } else {
      rawData = input as unknown as VimdronesRawShow;
    }

    const showName = rawData.show_name || "Vimdrones Imported Show";
    const drones = rawData.drones || [];

    if (!Array.isArray(drones) || drones.length === 0) {
      throw new Error("Vimdrones parser error: No drone tracks found in export payload.");
    }

    const waypointsByDrone: Record<string, ShowWaypoint[]> = {};
    const allWaypoints: ShowWaypoint[] = [];
    const droneIds: string[] = [];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxTimestampMs = 0;

    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const droneId = d.drone_id || `DRONE-${String(i + 1).padStart(2, "0")}`;
      droneIds.push(droneId);
      waypointsByDrone[droneId] = [];

      const keyframes = d.keyframes || [];

      for (const kf of keyframes) {
        const t_offset_ms = Math.round(kf.t_offset_ms ?? 0);
        if (t_offset_ms > maxTimestampMs) {
          maxTimestampMs = t_offset_ms;
        }

        const x = Number((kf.x ?? 0).toFixed(2));
        const y = Number((kf.y ?? 0).toFixed(2));
        const z = Number((kf.z ?? 0).toFixed(2));

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;

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
            r: Math.max(0, Math.min(255, kf.r ?? 255)),
            g: Math.max(0, Math.min(255, kf.g ?? 255)),
            b: Math.max(0, Math.min(255, kf.b ?? 255)),
            brightness: Math.max(0, Math.min(100, kf.brightness ?? 100)),
          },
        };

        waypointsByDrone[droneId].push(waypoint);
        allWaypoints.push(waypoint);
      }

      waypointsByDrone[droneId].sort((a, b) => a.t_offset_ms - b.t_offset_ms);
    }

    allWaypoints.sort((a, b) => a.t_offset_ms - b.t_offset_ms);

    return {
      id: showId,
      name: showName,
      source_tool: "vimdrones",
      duration_ms: rawData.duration_ms || maxTimestampMs || 60000,
      drone_count: droneIds.length,
      altitude_range: {
        min_m: Number((minZ === Infinity ? 0 : minZ).toFixed(2)),
        max_m: Number((maxZ === -Infinity ? 0 : maxZ).toFixed(2)),
      },
      spatial_bounds: {
        min_x: Number((minX === Infinity ? 0 : minX).toFixed(2)),
        max_x: Number((maxX === -Infinity ? 0 : maxX).toFixed(2)),
        min_y: Number((minY === Infinity ? 0 : minY).toFixed(2)),
        max_y: Number((maxY === -Infinity ? 0 : maxY).toFixed(2)),
        min_z: Number((minZ === Infinity ? 0 : minZ).toFixed(2)),
        max_z: Number((maxZ === -Infinity ? 0 : maxZ).toFixed(2)),
      },
      drones: droneIds,
      waypoints_by_drone: waypointsByDrone,
      all_waypoints: allWaypoints,
      imported_at: new Date().toISOString(),
      metadata: {
        format: rawData.format,
        frame_rate: rawData.frame_rate,
        ...rawData.metadata,
      },
      is_verified: true,
    };
  }
}
