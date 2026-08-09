export type FixType = "auto_correct" | "reroute_to_land" | "hold_or_rth";

export interface FixWaypoint {
  x: number;
  y: number;
  z: number;
  t_offset_ms: number;
}

export interface SuggestedFix {
  fix_type: FixType;
  waypoints: FixWaypoint[];
  collision_checked: boolean;
  safety_margin_m: number;
  estimated_duration_s: number;
  landing_zone_id?: string;
  detour_applied?: boolean;
  min_separation_m?: number;
  notes?: string;
}

export interface LandingZone {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number; // ground altitude
  radius_m: number;
}

export interface CollisionConflict {
  drone_id: string;
  t_ms: number;
  distance_m: number;
  candidate_position: [number, number, number];
  conflicting_drone_position: [number, number, number];
}

export interface CollisionCheckResult {
  is_safe: boolean;
  min_separation_m: number;
  conflicts: CollisionConflict[];
}
