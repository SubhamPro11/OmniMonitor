import { TelemetryEvent, WaypointPosition } from "./database";

export type HealthTier = "healthy" | "warning" | "critical";

export interface DroneHealthBreakdown {
  drone_id: string;
  timestamp: string;
  show_time_ms: number;
  
  // Intended vs Actual Spatial Delta
  intended_position: WaypointPosition | null;
  actual_position: WaypointPosition | null;
  position_delta_m: number;
  position_score: number; // 0 - 100 (Weight: 35%)

  // Battery Status
  battery_pct: number;
  battery_voltage: number;
  battery_score: number; // 0 - 100 (Weight: 25%)

  // Comms & Link Quality
  rssi_dbm: number;
  packet_loss_pct: number;
  link_quality: number; // 0 - 100 (Weight: 20%)

  // Thermal Status
  motor_temp_max: number; // Max of 4 motors in Celsius
  motor_temps: number[];
  thermal_score: number; // 0 - 100 (Weight: 20%)

  // Composite Health Score
  composite_health_score: number; // 0 - 100
  tier: HealthTier;

  // Stale / Offline tracking
  is_stale: boolean;
  last_received_ms_ago: number;
  raw_telemetry: TelemetryEvent | null;
}

export interface FleetSyncSnapshot {
  show_id: string | null;
  show_name: string | null;
  show_duration_ms: number;
  current_show_time_ms: number;
  is_show_running: boolean;
  total_drones: number;
  healthy_count: number;
  warning_count: number;
  critical_count: number;
  drones: DroneHealthBreakdown[];
}
