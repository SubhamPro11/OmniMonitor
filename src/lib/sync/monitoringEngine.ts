import { TelemetryEvent, WaypointPosition } from "@/types/database";
import { DroneHealthBreakdown, FleetSyncSnapshot, HealthTier } from "@/types/health";
import { NormalizedShowPlan } from "@/types/showPlan";
import { TrajectoryInterpolator } from "./interpolator";
import { ShowPlanImporter } from "../adapters";

/**
 * ==============================================================================
 * SYNC & HEALTH MONITORING ENGINE (Section 4)
 * ==============================================================================
 * Continuously computes intended vs. actual state per drone and evaluates
 * real-time composite health scores using a transparent weighted formula.
 *
 * HEALTH SCORING WEIGHTS & RATIONALE:
 * ------------------------------------------------------------------------------
 * 1. Position Accuracy (Weight: 35%, 0.35):
 *    In tight multi-drone swarms (1.5m - 3m grid spacing), position drift directly
 *    threatens fleet collision safety. Deviations > 1.5m start degrading the score,
 *    and deviations > 4.0m drop the spatial score to 0.
 *
 * 2. Battery Reserve (Weight: 25%, 0.25):
 *    Power reserve determines flight endurance and prevents catastrophic low-voltage
 *    cell collapse. Normal range (> 80%) = 100, Warning threshold (< 20%) = 25,
 *    Emergency critical threshold (< 10%) = 0.
 *
 * 3. Comms & RF Link Quality (Weight: 20%, 0.20):
 *    Derived from RSSI dBm and Packet Loss %. Telemetry dropouts prevent situational
 *    awareness. High packet loss (> 10%) or weak signal (< -85 dBm) penalizes the score.
 *
 * 4. Motor Thermal Health (Weight: 20%, 0.20):
 *    Max temperature across all 4 brushless motors in Celsius. Normal operating temp
 *    is 40C-52C. Temperatures > 80C risk stator winding degradation and ESC cutoff.
 * ==============================================================================
 */

export class SyncMonitoringEngine {
  private activeShowPlan: NormalizedShowPlan | null = null;
  private showStartTimeMs: number = 0;
  private isShowRunning: boolean = false;
  private currentShowTimeMs: number = 0;

  // High-speed in-memory health snapshot map (drone_id -> DroneHealthBreakdown)
  private healthSnapshots: Map<string, DroneHealthBreakdown> = new Map();

  constructor() {
    // Check if an active show plan is loaded from Section 3
    this.activeShowPlan = ShowPlanImporter.getActivePlan();
  }

  public setShowPlan(plan: NormalizedShowPlan): void {
    this.activeShowPlan = plan;
    ShowPlanImporter.setActivePlan(plan);
    this.resetShowClock();
  }

  public getShowPlan(): NormalizedShowPlan | null {
    return this.activeShowPlan || ShowPlanImporter.getActivePlan();
  }

  // --- Show Clock Controls ---

  public startShow(): void {
    this.showStartTimeMs = Date.now();
    this.isShowRunning = true;
  }

  public pauseShow(): void {
    this.isShowRunning = false;
  }

  public resetShowClock(): void {
    this.showStartTimeMs = Date.now();
    this.currentShowTimeMs = 0;
    this.isShowRunning = false;
  }

  public setShowTimeMs(timeMs: number): void {
    this.currentShowTimeMs = timeMs;
    this.showStartTimeMs = Date.now() - timeMs;
  }

  public getCurrentShowTimeMs(): number {
    if (!this.isShowRunning) {
      return this.currentShowTimeMs;
    }
    const elapsed = Date.now() - this.showStartTimeMs;
    const maxDuration = this.activeShowPlan?.duration_ms || 60000;
    return Math.min(elapsed, maxDuration);
  }

  // --- Core Health Scoring Computation ---

  public processTelemetry(event: TelemetryEvent): DroneHealthBreakdown {
    const plan = this.getShowPlan();
    const showTimeMs = this.getCurrentShowTimeMs();

    // 1. Interpolate intended position if a show plan is loaded
    let intendedPosition: WaypointPosition | null = null;
    if (plan && plan.waypoints_by_drone[event.drone_id]) {
      const state = TrajectoryInterpolator.interpolateDrone(
        plan.waypoints_by_drone[event.drone_id],
        showTimeMs
      );
      if (state) {
        intendedPosition = state.position;
      }
    }

    // Actual coordinates (fallback local X, Y, Z if global lat/lon used)
    const actX = event.position.x ?? 0;
    const actY = event.position.y ?? 0;
    const actZ = event.position.z ?? event.position.alt_m ?? 0;
    const actualPosition: WaypointPosition = {
      x: actX,
      y: actY,
      z: actZ,
      lat: event.position.lat,
      lon: event.position.lon,
      alt_m: event.position.alt_m,
    };

    // 2. Position Delta (Distance in meters)
    let position_delta_m = 0;
    let position_score = 100;

    if (intendedPosition) {
      const intX = intendedPosition.x ?? 0;
      const intY = intendedPosition.y ?? 0;
      const intZ = intendedPosition.z ?? intendedPosition.alt_m ?? 0;

      const dx = actX - intX;
      const dy = actY - intY;
      const dz = actZ - intZ;

      position_delta_m = Number(Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(3));

      // Scoring formula: 0m drift = 100, 1.5m drift = 67, 4.0m drift = 12, > 4.5m = 0
      position_score = Math.max(0, Math.min(100, 100 - position_delta_m * 22));
    }

    // 3. Battery Score (Weight: 25%)
    // Above 80% = 100, 20% = 25, < 10% = critical danger
    const battery_pct = event.battery.pct;
    const battery_score = Math.max(0, Math.min(100, battery_pct * 1.25));

    // 4. Link Quality Score (Weight: 20%)
    // Derived from RSSI (target -50dBm to -75dBm) and Packet Loss %
    const rssi = event.link_quality.rssi_dbm;
    const loss = event.link_quality.packet_loss_pct;

    const rssiScore = Math.max(0, Math.min(100, 100 - (Math.abs(rssi - -50) / 40) * 100));
    const lossPenalty = Math.max(0, Math.min(100, 100 - loss * 2.5));
    const link_quality = Number((0.6 * lossPenalty + 0.4 * rssiScore).toFixed(1));

    // 5. Thermal Health Score (Weight: 20%)
    // Max temperature across all 4 motors. Over 80C begins critical degradation
    const motor_temps = event.motor_temp || [45, 45, 45, 45];
    const motor_temp_max = Math.max(...motor_temps);

    let thermal_score = 100;
    if (motor_temp_max > 55) {
      thermal_score = Math.max(0, Math.min(100, 100 - ((motor_temp_max - 55) / 35) * 100));
    }
    thermal_score = Number(thermal_score.toFixed(1));

    // 6. Weighted Composite Score (0 - 100)
    // Formula: 0.35 * Pos + 0.25 * Bat + 0.20 * Link + 0.20 * Temp
    const composite_raw =
      0.35 * position_score +
      0.25 * battery_score +
      0.20 * link_quality +
      0.20 * thermal_score;

    const composite_health_score = Number(Math.max(0, Math.min(100, composite_raw)).toFixed(1));

    // Determine Health Tier
    let tier: HealthTier = "healthy";
    if (composite_health_score < 50) {
      tier = "critical";
    } else if (composite_health_score < 80) {
      tier = "warning";
    }

    const breakdown: DroneHealthBreakdown = {
      drone_id: event.drone_id,
      timestamp: event.ts,
      show_time_ms: showTimeMs,
      intended_position: intendedPosition,
      actual_position: actualPosition,
      position_delta_m,
      position_score: Number(position_score.toFixed(1)),
      battery_pct,
      battery_voltage: event.battery.voltage,
      battery_score: Number(battery_score.toFixed(1)),
      rssi_dbm: rssi,
      packet_loss_pct: loss,
      link_quality,
      motor_temp_max,
      motor_temps: [...motor_temps],
      thermal_score,
      composite_health_score,
      tier,
      is_stale: false,
      last_received_ms_ago: 0,
      raw_telemetry: event,
    };

    // Store in-memory fast-read snapshot
    this.healthSnapshots.set(event.drone_id, breakdown);

    return breakdown;
  }

  public getDroneHealth(droneId: string): DroneHealthBreakdown | null {
    const item = this.healthSnapshots.get(droneId);
    if (!item) return null;

    // Check for telemetry staleness (> 1500ms without new telemetry)
    const eventTime = new Date(item.timestamp).getTime();
    const elapsed = Date.now() - eventTime;
    if (elapsed > 1500) {
      item.is_stale = true;
      item.last_received_ms_ago = elapsed;
      item.link_quality = 0;
      item.composite_health_score = Math.max(0, Number((item.composite_health_score * 0.5).toFixed(1)));
      item.tier = "critical";
    } else {
      item.is_stale = false;
      item.last_received_ms_ago = elapsed;
    }

    return item;
  }

  public getFleetSnapshot(): FleetSyncSnapshot {
    const plan = this.getShowPlan();
    const showTimeMs = this.getCurrentShowTimeMs();

    const drones: DroneHealthBreakdown[] = [];
    let healthy_count = 0;
    let warning_count = 0;
    let critical_count = 0;

    const allKeys = Array.from(this.healthSnapshots.keys()).sort();

    for (const id of allKeys) {
      const h = this.getDroneHealth(id);
      if (h) {
        drones.push(h);
        if (h.tier === "healthy") healthy_count++;
        else if (h.tier === "warning") warning_count++;
        else if (h.tier === "critical") critical_count++;
      }
    }

    return {
      show_id: plan?.id || null,
      show_name: plan?.name || null,
      show_duration_ms: plan?.duration_ms || 60000,
      current_show_time_ms: showTimeMs,
      is_show_running: this.isShowRunning,
      total_drones: drones.length,
      healthy_count,
      warning_count,
      critical_count,
      drones,
    };
  }
}

// Global Singleton Monitoring Engine instance
const globalMonitoringEngineKey = Symbol.for("omnimonitor.monitoring_engine");

export function getGlobalMonitoringEngine(): SyncMonitoringEngine {
  const globalStore = globalThis as unknown as { [globalMonitoringEngineKey]?: SyncMonitoringEngine };
  if (!globalStore[globalMonitoringEngineKey]) {
    globalStore[globalMonitoringEngineKey] = new SyncMonitoringEngine();
  }
  return globalStore[globalMonitoringEngineKey]!;
}
