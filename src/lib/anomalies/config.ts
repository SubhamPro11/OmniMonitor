export interface AnomalyThresholdsConfig {
  battery_warning_pct: number; // default: 20.0%
  battery_critical_pct: number; // default: 10.0%
  position_drift_warning_m: number; // default: 1.5m
  position_drift_critical_m: number; // default: 4.0m
  packet_loss_warning_pct: number; // default: 10.0%
  link_loss_critical_seconds: number; // default: 3.0s
  motor_temp_critical_c: number; // default: 80.0C
  debounce_consecutive_readings: number; // default: 2 consecutive readings
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyThresholdsConfig = {
  battery_warning_pct: 20.0,
  battery_critical_pct: 10.0,
  position_drift_warning_m: 1.5,
  position_drift_critical_m: 4.0,
  packet_loss_warning_pct: 10.0,
  link_loss_critical_seconds: 3.0,
  motor_temp_critical_c: 80.0,
  debounce_consecutive_readings: 2,
};
