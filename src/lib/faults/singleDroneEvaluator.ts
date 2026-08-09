/**
 * OmniMonitor Single-Drone Fault Evaluation Engine
 * Pure evaluation pipeline: analyzes incoming telemetry packets against configurable thresholds.
 */

import crypto from "crypto";
import { TelemetryEvent, WaypointPosition } from "@/types/database";
import { FaultEventPayload, FaultType, FaultCategory, FaultSeverity, TriggerMode } from "@/types/faults";
import { FaultEngineConfig, DEFAULT_FAULT_CONFIG } from "./config";
import { MetricDebouncer } from "./debouncer";

export interface EvaluationContext {
  packet: TelemetryEvent;
  intendedPosition?: WaypointPosition | null;
  history?: TelemetryEvent[];
  lastSeenMs?: number;
  nowMs?: number;
}

export class SingleDroneEvaluator {
  private config: FaultEngineConfig;
  private debouncer: MetricDebouncer;

  constructor(config: FaultEngineConfig = DEFAULT_FAULT_CONFIG, debouncer?: MetricDebouncer) {
    this.config = config;
    this.debouncer = debouncer || new MetricDebouncer();
  }

  public updateConfig(newConfig: Partial<FaultEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): FaultEngineConfig {
    return this.config;
  }

  public getDebouncer(): MetricDebouncer {
    return this.debouncer;
  }

  /**
   * Main evaluation entry point: evaluates a single drone's telemetry against the taxonomy.
   * Returns a list of detected FaultEventPayloads (zero or more).
   */
  public evaluate(context: EvaluationContext): FaultEventPayload[] {
    const { packet, intendedPosition, history = [], lastSeenMs, nowMs = Date.now() } = context;
    const droneId = packet.drone_id;
    const timestamp = typeof packet.ts === "string" ? packet.ts : new Date(packet.ts).toISOString();
    const faults: FaultEventPayload[] = [];

    // Helper to construct structured fault payload
    const createFault = (
      category: FaultCategory,
      faultType: FaultType,
      severity: FaultSeverity,
      triggerMode: TriggerMode,
      metricName: string,
      observedValue: number | string,
      thresholdValue: number | string,
      unit: string,
      consecutiveBreaches: number,
      description: string
    ): FaultEventPayload => {
      return {
        id: crypto.randomUUID(),
        drone_id: droneId,
        timestamp,
        category,
        fault_type: faultType,
        severity,
        trigger_mode: triggerMode,
        triggering_metrics: {
          name: metricName,
          observed_value: observedValue,
          threshold_value: thresholdValue,
          unit,
        },
        consecutive_breaches: consecutiveBreaches,
        description,
        status: "pending",
      };
    };

    // =========================================================================
    // 1. Positional & RTK Evaluation
    // =========================================================================
    if (intendedPosition && packet.position) {
      const actX = packet.position.x ?? 0;
      const actY = packet.position.y ?? 0;
      const actZ = packet.position.z ?? packet.position.alt_m ?? 0;

      const intX = intendedPosition.x ?? actX;
      const intY = intendedPosition.y ?? actY;
      const intZ = intendedPosition.z ?? actZ;

      const dx = actX - intX;
      const dy = actY - intY;
      const dz = actZ - intZ;
      const delta3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const deltaZAbs = Math.abs(dz);

      // Positional Drift Critical Check
      if (delta3d >= this.config.positional.drift_critical_m) {
        const count = this.debouncer.recordBreach(droneId, "drift_crit", nowMs);
        if (count >= this.config.positional.debounce_drift_crit) {
          faults.push(
            createFault(
              "positional",
              "POSITION_DRIFT_CRIT",
              "critical",
              "sustained",
              "position_delta_3d",
              Number(delta3d.toFixed(2)),
              this.config.positional.drift_critical_m,
              "m",
              count,
              `Severe 3D position drift of ${delta3d.toFixed(2)}m (threshold: ${this.config.positional.drift_critical_m}m)`
            )
          );
        }
      } else if (delta3d >= this.config.positional.drift_warning_m) {
        this.debouncer.recordNominal(droneId, "drift_crit");
        const count = this.debouncer.recordBreach(droneId, "drift_warn", nowMs);
        if (count >= this.config.positional.debounce_drift_warn) {
          faults.push(
            createFault(
              "positional",
              "POSITION_DRIFT_WARN",
              "warning",
              "sustained",
              "position_delta_3d",
              Number(delta3d.toFixed(2)),
              this.config.positional.drift_warning_m,
              "m",
              count,
              `Moderate 3D position drift of ${delta3d.toFixed(2)}m (threshold: ${this.config.positional.drift_warning_m}m)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "drift_crit");
        this.debouncer.recordNominal(droneId, "drift_warn");
      }

      // Altitude Deviation Critical Check
      if (deltaZAbs >= this.config.positional.altitude_deviation_critical_m) {
        const count = this.debouncer.recordBreach(droneId, "alt_crit", nowMs);
        if (count >= this.config.positional.debounce_altitude_crit) {
          faults.push(
            createFault(
              "positional",
              "ALTITUDE_DEVIATION_CRIT",
              "critical",
              "sustained",
              "altitude_error_abs",
              Number(deltaZAbs.toFixed(2)),
              this.config.positional.altitude_deviation_critical_m,
              "m",
              count,
              `Critical vertical corridor breach: |ΔZ| = ${deltaZAbs.toFixed(2)}m (threshold: ${this.config.positional.altitude_deviation_critical_m}m)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "alt_crit");
      }
    }

    // GPS / RTK Fix Checks
    if (packet.gps_fix !== undefined) {
      const fixStr = String(packet.gps_fix).toUpperCase();
      if (fixStr === "NO_FIX" || fixStr === "0") {
        faults.push(
          createFault(
            "positional",
            "GPS_LOST_CRIT",
            "critical",
            "instant",
            "gps_fix",
            fixStr,
            "RTK_FIXED",
            "status",
            1,
            "Total GNSS loss (NO_FIX) — navigation compromised"
          )
        );
      } else if (fixStr !== "RTK_FIXED" && fixStr !== "3D_FIX_RTK") {
        const count = this.debouncer.recordBreach(droneId, "gps_degraded", nowMs);
        if (count >= this.config.positional.debounce_gps_degraded) {
          faults.push(
            createFault(
              "positional",
              "GPS_ACCURACY_DEGRADED",
              "warning",
              "sustained",
              "gps_fix",
              fixStr,
              "RTK_FIXED",
              "status",
              count,
              `GNSS accuracy degraded to '${fixStr}' (expected RTK_FIXED)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "gps_degraded");
      }
    }

    // =========================================================================
    // 2. Battery & Power Evaluation
    // =========================================================================
    if (packet.battery) {
      const { voltage, current_a, pct } = packet.battery;

      // Voltage Collapse Check (Instant Emergency)
      if (voltage <= this.config.battery.voltage_collapse_critical_v) {
        faults.push(
          createFault(
            "battery",
            "BATTERY_CELL_COLLAPSE",
            "critical",
            "instant",
            "pack_voltage",
            Number(voltage.toFixed(2)),
            this.config.battery.voltage_collapse_critical_v,
            "V",
            1,
            `Emergency pack voltage collapse: ${voltage.toFixed(2)}V (<= ${this.config.battery.voltage_collapse_critical_v}V)`
          )
        );
      }

      // Battery State of Charge (SoC) Critical & Warning
      if (pct <= this.config.battery.soc_critical_pct) {
        const count = this.debouncer.recordBreach(droneId, "soc_crit", nowMs);
        if (count >= this.config.battery.debounce_soc_crit) {
          faults.push(
            createFault(
              "battery",
              "BATTERY_SOC_CRIT",
              "critical",
              "sustained",
              "battery_pct",
              Number(pct.toFixed(1)),
              this.config.battery.soc_critical_pct,
              "%",
              count,
              `Critical battery charge level at ${pct.toFixed(1)}% (threshold: ${this.config.battery.soc_critical_pct}%)`
            )
          );
        }
      } else if (pct <= this.config.battery.soc_warning_pct) {
        this.debouncer.recordNominal(droneId, "soc_crit");
        const count = this.debouncer.recordBreach(droneId, "soc_warn", nowMs);
        if (count >= this.config.battery.debounce_soc_warn) {
          faults.push(
            createFault(
              "battery",
              "BATTERY_SOC_WARN",
              "warning",
              "sustained",
              "battery_pct",
              Number(pct.toFixed(1)),
              this.config.battery.soc_warning_pct,
              "%",
              count,
              `Low battery charge level at ${pct.toFixed(1)}% (threshold: ${this.config.battery.soc_warning_pct}%)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "soc_crit");
        this.debouncer.recordNominal(droneId, "soc_warn");
      }

      // Voltage Sag Under Load Check
      if (voltage <= this.config.battery.voltage_sag_warning_v && voltage > this.config.battery.voltage_collapse_critical_v) {
        const count = this.debouncer.recordBreach(droneId, "voltage_sag", nowMs);
        if (count >= this.config.battery.debounce_voltage_sag) {
          faults.push(
            createFault(
              "battery",
              "BATTERY_VOLTAGE_SAG",
              "warning",
              "sustained",
              "pack_voltage",
              Number(voltage.toFixed(2)),
              this.config.battery.voltage_sag_warning_v,
              "V",
              count,
              `Battery voltage sag under load: ${voltage.toFixed(2)}V (threshold: ${this.config.battery.voltage_sag_warning_v}V)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "voltage_sag");
      }

      // Overcurrent Check
      if (current_a >= this.config.battery.overcurrent_critical_a) {
        const count = this.debouncer.recordBreach(droneId, "overcurrent", nowMs);
        if (count >= this.config.battery.debounce_overcurrent) {
          faults.push(
            createFault(
              "battery",
              "BATTERY_OVERCURRENT_CRIT",
              "critical",
              "sustained",
              "current_a",
              Number(current_a.toFixed(1)),
              this.config.battery.overcurrent_critical_a,
              "A",
              count,
              `Excessive current draw: ${current_a.toFixed(1)}A (threshold: ${this.config.battery.overcurrent_critical_a}A)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "overcurrent");
      }
    }

    // =========================================================================
    // 3. Motor Thermal Array Evaluation
    // =========================================================================
    if (packet.motor_temp && packet.motor_temp.length > 0) {
      const maxTemp = Math.max(...packet.motor_temp);
      const minTemp = Math.min(...packet.motor_temp);
      const imbalance = maxTemp - minTemp;

      // Rate of Rise / Burnout Spike Check (comparing with previous packet in history)
      if (history.length > 0) {
        const prevPacket = history[history.length - 1];
        if (prevPacket.motor_temp && prevPacket.motor_temp.length > 0) {
          const prevMax = Math.max(...prevPacket.motor_temp);
          const dtSec = Math.max(0.05, (new Date(packet.ts).getTime() - new Date(prevPacket.ts).getTime()) / 1000);
          const rateOfRise = (maxTemp - prevMax) / dtSec;

          if (maxTemp >= this.config.thermal.burnout_min_temp_c && rateOfRise >= this.config.thermal.burnout_rate_spike_c_per_sec) {
            faults.push(
              createFault(
                "thermal",
                "MOTOR_STATOR_BURNOUT",
                "critical",
                "instant",
                "thermal_rate_of_rise",
                Number(rateOfRise.toFixed(1)),
                this.config.thermal.burnout_rate_spike_c_per_sec,
                "°C/s",
                1,
                `Rapid motor stator thermal spike of +${rateOfRise.toFixed(1)}°C/s reaching ${maxTemp.toFixed(1)}°C (imminent burnout)`
              )
            );
          }
        }
      }

      // Maximum Temperature Critical & Warning Check
      if (maxTemp >= this.config.thermal.motor_temp_critical_c) {
        const count = this.debouncer.recordBreach(droneId, "temp_crit", nowMs);
        if (count >= this.config.thermal.debounce_temp_crit) {
          faults.push(
            createFault(
              "thermal",
              "MOTOR_TEMP_CRIT",
              "critical",
              "sustained",
              "motor_temp_max",
              Number(maxTemp.toFixed(1)),
              this.config.thermal.motor_temp_critical_c,
              "°C",
              count,
              `Motor temperature critical: ${maxTemp.toFixed(1)}°C (threshold: ${this.config.thermal.motor_temp_critical_c}°C)`
            )
          );
        }
      } else if (maxTemp >= this.config.thermal.motor_temp_warning_c) {
        this.debouncer.recordNominal(droneId, "temp_crit");
        const count = this.debouncer.recordBreach(droneId, "temp_warn", nowMs);
        if (count >= this.config.thermal.debounce_temp_warn) {
          faults.push(
            createFault(
              "thermal",
              "MOTOR_TEMP_WARN",
              "warning",
              "sustained",
              "motor_temp_max",
              Number(maxTemp.toFixed(1)),
              this.config.thermal.motor_temp_warning_c,
              "°C",
              count,
              `Motor temperature elevated: ${maxTemp.toFixed(1)}°C (threshold: ${this.config.thermal.motor_temp_warning_c}°C)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "temp_crit");
        this.debouncer.recordNominal(droneId, "temp_warn");
      }

      // Inter-Motor Thermal Imbalance Check
      if (imbalance >= this.config.thermal.motor_imbalance_warning_c) {
        const count = this.debouncer.recordBreach(droneId, "imbalance_warn", nowMs);
        if (count >= this.config.thermal.debounce_imbalance) {
          faults.push(
            createFault(
              "thermal",
              "MOTOR_THERMAL_IMBALANCE",
              "warning",
              "sustained",
              "thermal_imbalance",
              Number(imbalance.toFixed(1)),
              this.config.thermal.motor_imbalance_warning_c,
              "°C",
              count,
              `4-motor thermal disparity of ${imbalance.toFixed(1)}°C between motors (threshold: ${this.config.thermal.motor_imbalance_warning_c}°C)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "imbalance_warn");
      }
    }

    // =========================================================================
    // 4. RF Link & Telemetry Evaluation
    // =========================================================================
    if (packet.link_quality) {
      const { rssi_dbm, packet_loss_pct } = packet.link_quality;

      // Packet Loss Critical & Warning
      if (packet_loss_pct >= this.config.rf_link.packet_loss_critical_pct) {
        const count = this.debouncer.recordBreach(droneId, "loss_crit", nowMs);
        if (count >= this.config.rf_link.debounce_packet_loss_crit) {
          faults.push(
            createFault(
              "rf_link",
              "LINK_PACKET_LOSS_CRIT",
              "critical",
              "sustained",
              "packet_loss_pct",
              Number(packet_loss_pct.toFixed(1)),
              this.config.rf_link.packet_loss_critical_pct,
              "%",
              count,
              `High packet loss of ${packet_loss_pct.toFixed(1)}% (threshold: ${this.config.rf_link.packet_loss_critical_pct}%)`
            )
          );
        }
      } else if (packet_loss_pct >= this.config.rf_link.packet_loss_warning_pct) {
        this.debouncer.recordNominal(droneId, "loss_crit");
        const count = this.debouncer.recordBreach(droneId, "loss_warn", nowMs);
        if (count >= this.config.rf_link.debounce_packet_loss_warn) {
          faults.push(
            createFault(
              "rf_link",
              "LINK_PACKET_LOSS_WARN",
              "warning",
              "sustained",
              "packet_loss_pct",
              Number(packet_loss_pct.toFixed(1)),
              this.config.rf_link.packet_loss_warning_pct,
              "%",
              count,
              `Moderate packet loss of ${packet_loss_pct.toFixed(1)}% (threshold: ${this.config.rf_link.packet_loss_warning_pct}%)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "loss_crit");
        this.debouncer.recordNominal(droneId, "loss_warn");
      }

      // Signal Strength (RSSI) Degradation
      if (rssi_dbm <= this.config.rf_link.rssi_degraded_dbm) {
        const count = this.debouncer.recordBreach(droneId, "rssi_warn", nowMs);
        if (count >= this.config.rf_link.debounce_rssi_warn) {
          faults.push(
            createFault(
              "rf_link",
              "LINK_RSSI_DEGRADED",
              "warning",
              "sustained",
              "rssi_dbm",
              Number(rssi_dbm.toFixed(1)),
              this.config.rf_link.rssi_degraded_dbm,
              "dBm",
              count,
              `Degraded RF signal strength at ${rssi_dbm.toFixed(1)} dBm (threshold: ${this.config.rf_link.rssi_degraded_dbm} dBm)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "rssi_warn");
      }
    }

    // Heartbeat Timeout Evaluation
    if (lastSeenMs !== undefined && lastSeenMs > 0) {
      const silenceSec = (nowMs - lastSeenMs) / 1000;
      if (silenceSec >= this.config.rf_link.heartbeat_timeout_sec) {
        faults.push(
          createFault(
            "rf_link",
            "LINK_HEARTBEAT_TIMEOUT",
            "critical",
            "instant",
            "silence_duration_s",
            Number(silenceSec.toFixed(1)),
            this.config.rf_link.heartbeat_timeout_sec,
            "s",
            1,
            `Telemetry heartbeat lost: ${silenceSec.toFixed(1)}s elapsed without packet (timeout: ${this.config.rf_link.heartbeat_timeout_sec}s)`
          )
        );
      }
    }

    // =========================================================================
    // 5. IMU Attitude & Kinematic Motion Evaluation
    // =========================================================================
    if (packet.imu) {
      const maxTilt = Math.max(Math.abs(packet.imu.pitch), Math.abs(packet.imu.roll));

      // Catastrophic Attitude Flip Check (Instant Emergency)
      if (maxTilt >= this.config.kinematics.tilt_flip_critical_deg) {
        faults.push(
          createFault(
            "kinematic_imu",
            "ATTITUDE_FLIP_CRIT",
            "critical",
            "instant",
            "max_tilt_deg",
            Number(maxTilt.toFixed(1)),
            this.config.kinematics.tilt_flip_critical_deg,
            "deg",
            1,
            `Severe attitude deviation: tilt angle ${maxTilt.toFixed(1)}° (>= ${this.config.kinematics.tilt_flip_critical_deg}° threshold)`
          )
        );
      } else if (maxTilt >= this.config.kinematics.tilt_warning_deg) {
        const count = this.debouncer.recordBreach(droneId, "tilt_warn", nowMs);
        if (count >= this.config.kinematics.debounce_tilt_warn) {
          faults.push(
            createFault(
              "kinematic_imu",
              "ATTITUDE_TILT_WARN",
              "warning",
              "sustained",
              "max_tilt_deg",
              Number(maxTilt.toFixed(1)),
              this.config.kinematics.tilt_warning_deg,
              "deg",
              count,
              `Excessive aerodynamic tilt angle: ${maxTilt.toFixed(1)}° (threshold: ${this.config.kinematics.tilt_warning_deg}°)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "tilt_warn");
      }
    }

    if (packet.velocity) {
      const { x: vx, y: vy, z: vz } = packet.velocity;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const vzAbs = Math.abs(vz);

      // Overspeed Check
      if (speed >= this.config.kinematics.overspeed_critical_mps) {
        const count = this.debouncer.recordBreach(droneId, "overspeed", nowMs);
        if (count >= this.config.kinematics.debounce_overspeed) {
          faults.push(
            createFault(
              "kinematic_imu",
              "VELOCITY_OVERSPEED_CRIT",
              "critical",
              "sustained",
              "speed_3d_mps",
              Number(speed.toFixed(2)),
              this.config.kinematics.overspeed_critical_mps,
              "m/s",
              count,
              `Excessive flight speed: ${speed.toFixed(2)} m/s (threshold: ${this.config.kinematics.overspeed_critical_mps} m/s)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "overspeed");
      }

      // Vertical Speed Limit Check
      if (vzAbs >= this.config.kinematics.vertical_speed_critical_mps) {
        const count = this.debouncer.recordBreach(droneId, "vspeed", nowMs);
        if (count >= this.config.kinematics.debounce_vertical_speed) {
          faults.push(
            createFault(
              "kinematic_imu",
              "VERTICAL_SPEED_BREACH",
              "critical",
              "sustained",
              "vertical_speed_abs_mps",
              Number(vzAbs.toFixed(2)),
              this.config.kinematics.vertical_speed_critical_mps,
              "m/s",
              count,
              `Vertical climb/descent speed limit exceeded: |vz| = ${vzAbs.toFixed(2)} m/s (threshold: ${this.config.kinematics.vertical_speed_critical_mps} m/s)`
            )
          );
        }
      } else {
        this.debouncer.recordNominal(droneId, "vspeed");
      }
    }

    return faults;
  }
}
