import { NormalizedShowPlan, ShowPlanSanityReport } from "@/types/showPlan";
import { ShowWaypoint } from "@/types/database";

export interface SkybrushRawPoint {
  t?: number; // seconds or ms
  t_ms?: number;
  time?: number;
  x?: number;
  y?: number;
  z?: number;
  pos?: [number, number, number];
  position?: { x?: number; y?: number; z?: number; lat?: number; lon?: number; alt_m?: number };
  color?: [number, number, number] | string;
  led?: { r?: number; g?: number; b?: number; brightness?: number };
}

export interface SkybrushDroneTrack {
  id?: string;
  drone_id?: string;
  name?: string;
  takeoff_time?: number;
  landing_time?: number;
  trajectory?: {
    points?: SkybrushRawPoint[];
    waypoints?: SkybrushRawPoint[];
  };
  points?: SkybrushRawPoint[];
  waypoints?: SkybrushRawPoint[];
}

export interface SkybrushRawShow {
  version?: string;
  title?: string;
  name?: string;
  duration?: number; // seconds
  duration_ms?: number;
  drones?: SkybrushDroneTrack[];
  swarm?: SkybrushDroneTrack[];
  tracks?: SkybrushDroneTrack[];
  metadata?: Record<string, unknown>;
}

/**
 * Skybrush Show-Plan Adapter (Section 3.1)
 * Parses .skyc / Skybrush JSON choreography files and extracts per-drone,
 * per-timestamp waypoints and LED states normalized into the standard schema.
 */
export class SkybrushAdapter {
  public static parse(input: string | Record<string, unknown>, showId = "skybrush-show"): NormalizedShowPlan {
    let rawData: SkybrushRawShow;

    if (typeof input === "string") {
      try {
        rawData = JSON.parse(input) as SkybrushRawShow;
      } catch (err) {
        throw new Error(`Skybrush parsing error: Invalid JSON payload (${err})`);
      }
    } else {
      rawData = input as SkybrushRawShow;
    }

    const showName = rawData.title || rawData.name || "Skybrush Imported Show";
    const droneTracks = rawData.drones || rawData.swarm || rawData.tracks || [];

    if (!Array.isArray(droneTracks) || droneTracks.length === 0) {
      throw new Error("Skybrush parser error: No drone tracks found in show payload.");
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

    droneTracks.forEach((track, index) => {
      const droneId = track.id || track.drone_id || track.name || `DRONE-${String(index + 1).padStart(2, "0")}`;
      droneIds.push(droneId);
      waypointsByDrone[droneId] = [];

      const rawPoints =
        track.trajectory?.points ||
        track.trajectory?.waypoints ||
        track.points ||
        track.waypoints ||
        [];

      for (const pt of rawPoints) {
        // Resolve timestamp in milliseconds
        let t_offset_ms = 0;
        if (pt.t_ms !== undefined) {
          t_offset_ms = Math.round(pt.t_ms);
        } else if (pt.t !== undefined) {
          // If t < 1000 and has decimals, it's in seconds
          t_offset_ms = pt.t > 1000 && Number.isInteger(pt.t) ? pt.t : Math.round(pt.t * 1000);
        } else if (pt.time !== undefined) {
          t_offset_ms = pt.time > 1000 && Number.isInteger(pt.time) ? pt.time : Math.round(pt.time * 1000);
        }

        if (t_offset_ms > maxTimestampMs) {
          maxTimestampMs = t_offset_ms;
        }

        // Resolve position coordinates
        let x = 0;
        let y = 0;
        let z = 0;
        let lat: number | undefined;
        let lon: number | undefined;
        let alt_m: number | undefined;

        if (pt.pos && Array.isArray(pt.pos)) {
          x = pt.pos[0] ?? 0;
          y = pt.pos[1] ?? 0;
          z = pt.pos[2] ?? 0;
        } else if (pt.position) {
          x = pt.position.x ?? 0;
          y = pt.position.y ?? 0;
          z = pt.position.z ?? pt.position.alt_m ?? 0;
          lat = pt.position.lat;
          lon = pt.position.lon;
          alt_m = pt.position.alt_m;
        } else {
          x = pt.x ?? 0;
          y = pt.y ?? 0;
          z = pt.z ?? 0;
        }

        // Bounding box tracking
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;

        // Resolve LED color
        let r = 255;
        let g = 255;
        let b = 255;
        let brightness = 100;

        if (Array.isArray(pt.color) && pt.color.length >= 3) {
          r = Math.max(0, Math.min(255, Math.round(pt.color[0])));
          g = Math.max(0, Math.min(255, Math.round(pt.color[1])));
          b = Math.max(0, Math.min(255, Math.round(pt.color[2])));
        } else if (pt.led) {
          r = pt.led.r ?? 255;
          g = pt.led.g ?? 255;
          b = pt.led.b ?? 255;
          brightness = pt.led.brightness ?? 100;
        } else if (typeof pt.color === "string" && pt.color.startsWith("#")) {
          const hex = pt.color.replace("#", "");
          if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
          }
        }

        const waypoint: ShowWaypoint = {
          show_id: showId,
          drone_id: droneId,
          t_offset_ms,
          position: {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            z: Number(z.toFixed(2)),
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

        waypointsByDrone[droneId].push(waypoint);
        allWaypoints.push(waypoint);
      }

      // Ensure chronological ordering
      waypointsByDrone[droneId].sort((a, b) => a.t_offset_ms - b.t_offset_ms);
    });

    allWaypoints.sort((a, b) => a.t_offset_ms - b.t_offset_ms);

    return {
      id: showId,
      name: showName,
      source_tool: "skybrush",
      duration_ms: maxTimestampMs || (rawData.duration ? rawData.duration * 1000 : 60000),
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
      metadata: rawData.metadata || {},
      is_verified: true,
    };
  }

  /**
   * Evaluates sanity metrics and safety flags on a parsed show plan.
   */
  public static evaluateSanity(plan: NormalizedShowPlan): ShowPlanSanityReport {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (plan.drone_count === 0) {
      errors.push("Show contains zero drones.");
    }
    if (plan.all_waypoints.length === 0) {
      errors.push("Show contains zero waypoints.");
    }
    if (plan.altitude_range.max_m > 120) {
      warnings.push(`Maximum altitude ${plan.altitude_range.max_m}m exceeds typical 120m AGL civil airspace limits.`);
    }
    if (plan.altitude_range.min_m < 0) {
      warnings.push(`Negative altitude detected (${plan.altitude_range.min_m}m) — check ground reference elevation.`);
    }
    if (plan.duration_ms < 5000) {
      warnings.push(`Very short show duration (${(plan.duration_ms / 1000).toFixed(1)}s).`);
    }

    return {
      is_valid: errors.length === 0,
      total_waypoints: plan.all_waypoints.length,
      drone_count: plan.drone_count,
      duration_ms: plan.duration_ms,
      altitude_range: plan.altitude_range,
      spatial_bounds: plan.spatial_bounds,
      warnings,
      errors,
    };
  }
}
