import { ShowWaypoint, ShowSourceTool } from "./database";

export interface SpatialBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_z: number;
  max_z: number;
}

export interface AltitudeRange {
  min_m: number;
  max_m: number;
}

export interface NormalizedShowPlan {
  id: string;
  name: string;
  source_tool: ShowSourceTool;
  duration_ms: number;
  drone_count: number;
  altitude_range: AltitudeRange;
  spatial_bounds: SpatialBounds;
  drones: string[]; // e.g. ["DRONE-01", "DRONE-02", ...]
  waypoints_by_drone: Record<string, ShowWaypoint[]>;
  all_waypoints: ShowWaypoint[];
  imported_at: string;
  metadata?: Record<string, unknown>;
  is_verified?: boolean;
}

export interface ShowPlanSanityReport {
  is_valid: boolean;
  total_waypoints: number;
  drone_count: number;
  duration_ms: number;
  altitude_range: AltitudeRange;
  spatial_bounds: SpatialBounds;
  warnings: string[];
  errors: string[];
}
