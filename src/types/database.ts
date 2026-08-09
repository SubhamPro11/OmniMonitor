/**
 * OmniMonitor Database & Domain Types
 * Matches the proposed Supabase schema for Section 1.
 */

export type DroneStatus = "idle" | "in_flight" | "fault" | "landed" | "offline";

export interface Drone {
  id: string; // Drone hardware or simulation ID (e.g. "DRONE-01")
  label: string; // Human-readable callsign (e.g. "Lead Alpha 1")
  status: DroneStatus;
  last_seen_at: string; // ISO-8601 UTC timestamp
  created_at?: string;
}

export type ShowSourceTool = "skybrush" | "verge_aero" | "vimdrones";

export interface Show {
  id: string; // UUID
  name: string;
  source_tool: ShowSourceTool;
  imported_at: string; // ISO-8601 UTC timestamp
  duration_ms?: number;
  drone_count?: number;
  metadata?: Record<string, unknown>;
}

export interface WaypointPosition {
  x: number; // relative local X in meters
  y: number; // relative local Y in meters
  z: number; // relative altitude in meters
  lat?: number; // optional global latitude
  lon?: number; // optional global longitude
  alt_m?: number; // optional global altitude
}

export interface WaypointLedState {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  brightness?: number; // 0-100%
  pattern?: string;
}

export interface ShowWaypoint {
  id?: string;
  show_id: string; // Foreign key -> Show
  drone_id: string; // Logical drone index/ID in the show choreo
  t_offset_ms: number; // Timeline offset from show start (milliseconds)
  position: WaypointPosition;
  led_state: WaypointLedState;
}

export interface TelemetryPosition {
  lat: number;
  lon: number;
  alt_m: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface TelemetryVelocity {
  x: number; // m/s
  y: number; // m/s
  z: number; // m/s
}

export interface TelemetryBattery {
  voltage: number; // Volts
  current_a: number; // Amperes
  pct: number; // 0-100%
}

export interface TelemetryImu {
  pitch: number; // degrees
  roll: number; // degrees
  yaw: number; // degrees
}

export interface TelemetryLink {
  rssi_dbm: number; // dBm (e.g. -65)
  packet_loss_pct: number; // 0-100%
}

export interface TelemetryEvent {
  id?: number | string;
  drone_id: string;
  ts: string; // ISO-8601 UTC timestamp or epoch ms
  position: TelemetryPosition;
  velocity: TelemetryVelocity;
  battery: TelemetryBattery;
  imu: TelemetryImu;
  link_quality: TelemetryLink;
  motor_temp: number[]; // Array of motor temperatures in Celsius (e.g. [45.2, 46.1, 44.8, 45.9])
  gps_fix: string | number; // e.g. "3D_FIX", "RTK_FIXED", "RTK_FLOAT", "NO_FIX"
  flight_mode: string; // e.g. "SHOW", "MANUAL", "LAND", "HOLD", "RTH"
}

export type FaultSeverity = "info" | "warning" | "critical";

export type FaultType =
  | "position_drift"
  | "battery_warning"
  | "battery_critical"
  | "motor_warning"
  | "motor_critical"
  | "comms_loss"
  | "gps_degradation";

export type FaultStatus = "pending" | "approved" | "rejected" | "auto_applied";

export interface SuggestedFixPayload {
  action: "auto_correct" | "reroute_to_land" | "hold_or_rth" | "abort_to_home";
  description: string;
  target_landing_zone?: string;
  nudge_duration_s?: number;
  collision_checked: boolean;
  computed_at: string;
  parameters?: Record<string, unknown>;
}

export interface FaultEvent {
  id: string; // UUID
  drone_id: string;
  detected_at: string; // ISO-8601 UTC
  fault_type: FaultType;
  severity: FaultSeverity;
  delta: Record<string, unknown> | number | string; // The observed breach value vs threshold
  suggested_fix?: SuggestedFixPayload | import("./replanning").SuggestedFix | Record<string, unknown> | null;
  status: FaultStatus;
  resolved_at?: string | null;
  rejection_reason?: string | null;
}
