/**
 * OmniMonitor Fault Engine Configurable Thresholds
 * Centralized, documented parameters for single-drone and fleet/swarm evaluation.
 */

export interface PositionalThresholds {
  drift_warning_m: number; // default: 1.2m
  drift_critical_m: number; // default: 2.5m
  altitude_deviation_critical_m: number; // default: 2.0m
  debounce_drift_warn: number; // default: 3 consecutive readings
  debounce_drift_crit: number; // default: 2 consecutive readings
  debounce_altitude_crit: number; // default: 2 consecutive readings
  debounce_gps_degraded: number; // default: 3 consecutive readings
}

export interface BatteryThresholds {
  soc_warning_pct: number; // default: 20.0%
  soc_critical_pct: number; // default: 10.0%
  voltage_sag_warning_v: number; // default: 13.6V (3.4V/cell for 4S)
  voltage_collapse_critical_v: number; // default: 12.8V (3.2V/cell for 4S)
  overcurrent_critical_a: number; // default: 42.0A
  debounce_soc_warn: number; // default: 4 consecutive readings
  debounce_soc_crit: number; // default: 2 consecutive readings
  debounce_voltage_sag: number; // default: 3 consecutive readings
  debounce_overcurrent: number; // default: 2 consecutive readings
}

export interface ThermalThresholds {
  motor_temp_warning_c: number; // default: 72.0C
  motor_temp_critical_c: number; // default: 82.0C
  motor_imbalance_warning_c: number; // default: 18.0C (max - min)
  burnout_rate_spike_c_per_sec: number; // default: +4.0C/s spike
  burnout_min_temp_c: number; // default: 75.0C baseline for burnout trigger
  debounce_temp_warn: number; // default: 4 consecutive readings
  debounce_temp_crit: number; // default: 2 consecutive readings
  debounce_imbalance: number; // default: 4 consecutive readings
}

export interface RfLinkThresholds {
  rssi_degraded_dbm: number; // default: -82 dBm
  packet_loss_warning_pct: number; // default: 12.0%
  packet_loss_critical_pct: number; // default: 35.0%
  heartbeat_timeout_sec: number; // default: 2.5s
  debounce_rssi_warn: number; // default: 4 consecutive readings
  debounce_packet_loss_warn: number; // default: 3 consecutive readings
  debounce_packet_loss_crit: number; // default: 2 consecutive readings
}

export interface KinematicImuThresholds {
  tilt_warning_deg: number; // default: 25.0 degrees
  tilt_flip_critical_deg: number; // default: 45.0 degrees
  overspeed_critical_mps: number; // default: 8.0 m/s
  vertical_speed_critical_mps: number; // default: 4.0 m/s
  motion_stall_threshold_mps: number; // default: 0.1 m/s
  debounce_tilt_warn: number; // default: 3 consecutive readings
  debounce_overspeed: number; // default: 2 consecutive readings
  debounce_vertical_speed: number; // default: 2 consecutive readings
  debounce_stall: number; // default: 4 consecutive readings
}

export interface SwarmThresholds {
  collision_min_separation_m: number; // default: 2.0m (safe minimum corridor)
  collision_emergency_separation_m: number; // default: 1.2m (critical collision hazard)
  link_degradation_fleet_pct: number; // default: 35.0% of fleet
  link_loss_packet_loss_threshold_pct: number; // default: 12.0%
  correlated_drift_min_drones: number; // default: 3 drones
  correlated_drift_distance_m: number; // default: 1.0m
  correlated_drift_cosine_similarity: number; // default: 0.80 (alignment threshold)
  debounce_collision_crit: number; // default: 1 (Instant)
  debounce_collision_warn: number; // default: 2
  debounce_swarm_link: number; // default: 2
  debounce_swarm_drift: number; // default: 2
}

export interface FaultEngineConfig {
  positional: PositionalThresholds;
  battery: BatteryThresholds;
  thermal: ThermalThresholds;
  rf_link: RfLinkThresholds;
  kinematics: KinematicImuThresholds;
  swarm: SwarmThresholds;
  history_buffer_size: number; // default: 10 packets
}

export const DEFAULT_FAULT_CONFIG: FaultEngineConfig = {
  positional: {
    drift_warning_m: 1.2,
    drift_critical_m: 2.5,
    altitude_deviation_critical_m: 2.0,
    debounce_drift_warn: 3,
    debounce_drift_crit: 2,
    debounce_altitude_crit: 2,
    debounce_gps_degraded: 3,
  },
  battery: {
    soc_warning_pct: 20.0,
    soc_critical_pct: 10.0,
    voltage_sag_warning_v: 13.6,
    voltage_collapse_critical_v: 12.8,
    overcurrent_critical_a: 42.0,
    debounce_soc_warn: 4,
    debounce_soc_crit: 2,
    debounce_voltage_sag: 3,
    debounce_overcurrent: 2,
  },
  thermal: {
    motor_temp_warning_c: 72.0,
    motor_temp_critical_c: 82.0,
    motor_imbalance_warning_c: 18.0,
    burnout_rate_spike_c_per_sec: 4.0,
    burnout_min_temp_c: 75.0,
    debounce_temp_warn: 4,
    debounce_temp_crit: 2,
    debounce_imbalance: 4,
  },
  rf_link: {
    rssi_degraded_dbm: -82.0,
    packet_loss_warning_pct: 12.0,
    packet_loss_critical_pct: 35.0,
    heartbeat_timeout_sec: 2.5,
    debounce_rssi_warn: 4,
    debounce_packet_loss_warn: 3,
    debounce_packet_loss_crit: 2,
  },
  kinematics: {
    tilt_warning_deg: 25.0,
    tilt_flip_critical_deg: 45.0,
    overspeed_critical_mps: 8.0,
    vertical_speed_critical_mps: 4.0,
    motion_stall_threshold_mps: 0.1,
    debounce_tilt_warn: 3,
    debounce_overspeed: 2,
    debounce_vertical_speed: 2,
    debounce_stall: 4,
  },
  swarm: {
    collision_min_separation_m: 2.0,
    collision_emergency_separation_m: 1.2,
    link_degradation_fleet_pct: 35.0,
    link_loss_packet_loss_threshold_pct: 12.0,
    correlated_drift_min_drones: 3,
    correlated_drift_distance_m: 1.0,
    correlated_drift_cosine_similarity: 0.8,
    debounce_collision_crit: 1,
    debounce_collision_warn: 2,
    debounce_swarm_link: 2,
    debounce_swarm_drift: 2,
  },
  history_buffer_size: 10,
};
