/**
 * OmniMonitor Fault Detection Engine Domain Types
 * Conforms to Section 1 & Section 3 Fault Taxonomy & Severity Model Specification.
 */

export type FaultSeverity = "warning" | "critical";

export type TriggerMode = "instant" | "sustained";

export type FaultCategory =
  | "positional"
  | "battery"
  | "thermal"
  | "rf_link"
  | "kinematic_imu"
  | "swarm";

export type FaultType =
  // Positional & RTK
  | "POSITION_DRIFT_WARN"
  | "POSITION_DRIFT_CRIT"
  | "ALTITUDE_DEVIATION_CRIT"
  | "GPS_ACCURACY_DEGRADED"
  | "GPS_LOST_CRIT"
  // Battery & Power
  | "BATTERY_SOC_WARN"
  | "BATTERY_SOC_CRIT"
  | "BATTERY_VOLTAGE_SAG"
  | "BATTERY_CELL_COLLAPSE"
  | "BATTERY_OVERCURRENT_CRIT"
  // Thermal Array
  | "MOTOR_TEMP_WARN"
  | "MOTOR_TEMP_CRIT"
  | "MOTOR_THERMAL_IMBALANCE"
  | "MOTOR_STATOR_BURNOUT"
  // RF Link
  | "LINK_RSSI_DEGRADED"
  | "LINK_PACKET_LOSS_WARN"
  | "LINK_PACKET_LOSS_CRIT"
  | "LINK_HEARTBEAT_TIMEOUT"
  // IMU & Kinematics
  | "ATTITUDE_TILT_WARN"
  | "ATTITUDE_FLIP_CRIT"
  | "VELOCITY_OVERSPEED_CRIT"
  | "VERTICAL_SPEED_BREACH"
  | "MOTION_STALL_WARN"
  // Swarm-Level Cross-Drone Anomalies (Section 3)
  | "COLLISION_PROXIMITY_CRIT"
  | "COLLISION_PROXIMITY_WARN"
  | "SWARM_LINK_DEGRADATION"
  | "SWARM_CORRELATED_DRIFT";

export interface MetricBreachDetail {
  name: string; // e.g. "position_delta_3d", "proximity_distance_m", "affected_fleet_pct"
  observed_value: number | string;
  threshold_value: number | string;
  unit: string; // e.g. "m", "%", "°C", "dBm", "V", "A", "deg", "m/s"
}

export interface FaultEventPayload {
  id: string; // UUID v4
  drone_id: string; // e.g. "DRONE-01" or "SWARM" / "FLEET"
  involved_drone_ids?: string[]; // e.g. ["DRONE-01", "DRONE-04"] for collision pairs
  timestamp: string; // ISO-8601 UTC timestamp
  category: FaultCategory;
  fault_type: FaultType;
  severity: FaultSeverity;
  trigger_mode: TriggerMode;
  triggering_metrics: MetricBreachDetail;
  consecutive_breaches: number;
  description: string;
  status: "pending";
  resolved_at?: string | null;
}

export interface DronePacketHistory {
  drone_id: string;
  packets: import("./database").TelemetryEvent[];
  max_size: number;
}
