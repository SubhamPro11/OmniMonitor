import { FaultEvent, FaultSeverity, FaultType } from "@/types/database";
import { DroneHealthBreakdown } from "@/types/health";
import { AnomalyThresholdsConfig, DEFAULT_ANOMALY_CONFIG } from "./config";
import { supabase } from "../supabase";
import { RePlanningEngine } from "../replanning/engine";
import { getGlobalMonitoringEngine } from "../sync/monitoringEngine";

interface DroneBreachTracking {
  battery_warning_streak: number;
  battery_critical_streak: number;
  drift_warning_streak: number;
  drift_critical_streak: number;
  loss_warning_streak: number;
  temp_critical_streak: number;
  last_seen_ts: number;
}

export type FaultEventListener = (event: FaultEvent) => void;

/**
 * Rule-Based Anomaly Detector with Debounce Filter (Section 5 & 6)
 * Classifies telemetry threshold breaches into actionable, debounced fault_events
 * and populates collision-checked suggested_fix trajectories.
 */
export class AnomalyDetector {
  private config: AnomalyThresholdsConfig;
  private tracking: Map<string, DroneBreachTracking> = new Map();
  private activeFaults: Map<string, FaultEvent> = new Map(); // key: drone_id:fault_type
  private eventHistory: FaultEvent[] = [];
  private maxHistorySize = 100;
  private listeners: Set<FaultEventListener> = new Set();
  private commsLossCheckTimer: NodeJS.Timeout | null = null;
  private monitoringEngine: import("../sync/monitoringEngine").SyncMonitoringEngine | null = null;

  constructor(
    config?: Partial<AnomalyThresholdsConfig>,
    monitoringEngine?: import("../sync/monitoringEngine").SyncMonitoringEngine
  ) {
    this.config = { ...DEFAULT_ANOMALY_CONFIG, ...config };
    this.monitoringEngine = monitoringEngine || null;

    // Pre-register active fleet drones so comms loss is tracked from show start
    for (let i = 1; i <= 12; i++) {
      const droneId = `DRONE-${String(i).padStart(2, "0")}`;
      this.tracking.set(droneId, {
        battery_warning_streak: 0,
        battery_critical_streak: 0,
        drift_warning_streak: 0,
        drift_critical_streak: 0,
        loss_warning_streak: 0,
        temp_critical_streak: 0,
        last_seen_ts: Date.now(),
      });
    }

    // Periodic check for comms loss (> 3 seconds without telemetry)
    this.commsLossCheckTimer = setInterval(() => {
      this.checkCommsTimeouts();
    }, 500);
  }

  public getConfig(): AnomalyThresholdsConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AnomalyThresholdsConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public onFault(listener: FaultEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getActiveFaults(): FaultEvent[] {
    return Array.from(this.activeFaults.values()).sort((a, b) =>
      b.detected_at.localeCompare(a.detected_at)
    );
  }

  public getEventHistory(): FaultEvent[] {
    return [...this.eventHistory];
  }

  public resetAll(): void {
    this.tracking.clear();
    this.activeFaults.clear();
    this.eventHistory = [];
  }

  /**
   * Evaluates a live health breakdown for a drone.
   * Debounces breaches over N consecutive readings before generating a FaultEvent.
   */
  public evaluate(health: DroneHealthBreakdown): FaultEvent[] {
    const droneId = health.drone_id;
    const now = Date.now();

    let track = this.tracking.get(droneId);
    if (!track) {
      track = {
        battery_warning_streak: 0,
        battery_critical_streak: 0,
        drift_warning_streak: 0,
        drift_critical_streak: 0,
        loss_warning_streak: 0,
        temp_critical_streak: 0,
        last_seen_ts: now,
      };
      this.tracking.set(droneId, track);
    }
    track.last_seen_ts = now;

    // Clear any active comms_loss if drone is actively reporting
    this.resolveFault(droneId, "comms_loss");

    const requiredStreak = this.config.debounce_consecutive_readings;
    const firedEvents: FaultEvent[] = [];

    // --------------------------------------------------------------------------
    // RULE 1: Battery Monitoring
    // battery_pct < 10 -> "critical"; battery_pct < 20 -> "warning"
    // --------------------------------------------------------------------------
    if (health.battery_pct < this.config.battery_critical_pct) {
      track.battery_critical_streak++;
      track.battery_warning_streak = 0;
      if (track.battery_critical_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "battery_critical",
          "critical",
          {
            metric: "battery_pct",
            observed_value: health.battery_pct,
            threshold: this.config.battery_critical_pct,
            unit: "%",
            description: `Battery at critical level ${health.battery_pct.toFixed(1)}% (Threshold: < ${this.config.battery_critical_pct}%)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else if (health.battery_pct < this.config.battery_warning_pct) {
      track.battery_warning_streak++;
      track.battery_critical_streak = 0;
      if (track.battery_warning_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "battery_warning",
          "warning",
          {
            metric: "battery_pct",
            observed_value: health.battery_pct,
            threshold: this.config.battery_warning_pct,
            unit: "%",
            description: `Battery low at ${health.battery_pct.toFixed(1)}% (Threshold: < ${this.config.battery_warning_pct}%)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else {
      track.battery_critical_streak = 0;
      track.battery_warning_streak = 0;
      this.resolveFault(droneId, "battery_critical");
      this.resolveFault(droneId, "battery_warning");
    }

    // --------------------------------------------------------------------------
    // RULE 2: Position Drift Monitoring
    // position_delta_m > 4.0 -> "critical"; position_delta_m > 1.5 -> "warning"
    // --------------------------------------------------------------------------
    if (health.position_delta_m > this.config.position_drift_critical_m) {
      track.drift_critical_streak++;
      track.drift_warning_streak = 0;
      if (track.drift_critical_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "position_drift",
          "critical",
          {
            metric: "position_delta_m",
            observed_value: health.position_delta_m,
            threshold: this.config.position_drift_critical_m,
            unit: "m",
            description: `Severe spatial deviation ${health.position_delta_m.toFixed(2)}m from intended path (Critical threshold: > ${this.config.position_drift_critical_m}m)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else if (health.position_delta_m > this.config.position_drift_warning_m) {
      track.drift_warning_streak++;
      track.drift_critical_streak = 0;
      if (track.drift_warning_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "position_drift",
          "warning",
          {
            metric: "position_delta_m",
            observed_value: health.position_delta_m,
            threshold: this.config.position_drift_warning_m,
            unit: "m",
            description: `Formation position drift ${health.position_delta_m.toFixed(2)}m (Warning threshold: > ${this.config.position_drift_warning_m}m)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else {
      track.drift_critical_streak = 0;
      track.drift_warning_streak = 0;
      this.resolveFault(droneId, "position_drift");
    }

    // --------------------------------------------------------------------------
    // RULE 3: Packet Loss Monitoring
    // link.packet_loss_pct > 10 -> "warning"
    // --------------------------------------------------------------------------
    if (health.packet_loss_pct > this.config.packet_loss_warning_pct) {
      track.loss_warning_streak++;
      if (track.loss_warning_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "comms_loss",
          "warning",
          {
            metric: "packet_loss_pct",
            observed_value: health.packet_loss_pct,
            threshold: this.config.packet_loss_warning_pct,
            unit: "%",
            description: `RF telemetry packet loss elevated at ${health.packet_loss_pct.toFixed(0)}% (Threshold: > ${this.config.packet_loss_warning_pct}%)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else {
      track.loss_warning_streak = 0;
      // Only resolve warning comms loss if critical comms loss is not active
      const active = this.activeFaults.get(`${droneId}:comms_loss`);
      if (active && active.severity === "warning") {
        this.resolveFault(droneId, "comms_loss");
      }
    }

    // --------------------------------------------------------------------------
    // RULE 4: Motor Thermal Overheat Monitoring
    // any motor_temp_c > 80 -> "critical"
    // --------------------------------------------------------------------------
    if (health.motor_temp_max > this.config.motor_temp_critical_c) {
      track.temp_critical_streak++;
      if (track.temp_critical_streak >= requiredStreak) {
        const evt = this.raiseFault(
          droneId,
          "motor_critical",
          "critical",
          {
            metric: "motor_temp_max",
            observed_value: health.motor_temp_max,
            threshold: this.config.motor_temp_critical_c,
            unit: "C",
            description: `Motor stator thermal breach at ${health.motor_temp_max.toFixed(1)}°C (Critical threshold: > ${this.config.motor_temp_critical_c}°C)`,
          },
          health
        );
        if (evt) firedEvents.push(evt);
      }
    } else {
      track.temp_critical_streak = 0;
      this.resolveFault(droneId, "motor_critical");
    }

    return firedEvents;
  }

  public checkCommsTimeouts(): void {
    const now = Date.now();
    const timeoutMs = this.config.link_loss_critical_seconds * 1000;

    this.tracking.forEach((track, droneId) => {
      const elapsed = now - track.last_seen_ts;
      if (elapsed > timeoutMs) {
        const monitoring = this.monitoringEngine || getGlobalMonitoringEngine();
        const health = monitoring.getDroneHealth(droneId);
        this.raiseFault(
          droneId,
          "comms_loss",
          "critical",
          {
            metric: "link_loss_seconds",
            observed_value: Number((elapsed / 1000).toFixed(1)),
            threshold: this.config.link_loss_critical_seconds,
            unit: "s",
            description: `Complete RF telemetry loss for ${(elapsed / 1000).toFixed(1)}s (Critical timeout: > ${this.config.link_loss_critical_seconds}s)`,
          },
          health || undefined
        );
      }
    });
  }

  private raiseFault(
    droneId: string,
    faultType: FaultType,
    severity: FaultSeverity,
    delta: Record<string, unknown>,
    health?: DroneHealthBreakdown
  ): FaultEvent | null {
    const key = `${droneId}:${faultType}`;
    const existing = this.activeFaults.get(key);

    // If already active with same severity, do not duplicate event
    if (existing && existing.severity === severity) {
      return null;
    }

    // Generate unique UUID
    const id = `fault-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const event: FaultEvent = {
      id,
      drone_id: droneId,
      detected_at: new Date().toISOString(),
      fault_type: faultType,
      severity,
      delta,
      suggested_fix: RePlanningEngine.generateFix(
        { id, drone_id: droneId, detected_at: "", fault_type: faultType, severity, delta, status: "pending" },
        health || null
      ),
      status: "pending",
      resolved_at: null,
    };

    this.activeFaults.set(key, event);
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.pop();
    }

    // Notify listeners
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.error("Fault event listener error:", err);
      }
    });

    // Asynchronously persist to Supabase if available
    this.persistFaultToSupabase(event);

    return event;
  }

  private resolveFault(droneId: string, faultType: FaultType): void {
    const key = `${droneId}:${faultType}`;
    const active = this.activeFaults.get(key);
    if (active) {
      active.resolved_at = new Date().toISOString();
      this.activeFaults.delete(key);
    }
  }

  private async persistFaultToSupabase(event: FaultEvent): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from("fault_events").insert({
        id: event.id,
        drone_id: event.drone_id,
        detected_at: event.detected_at,
        fault_type: event.fault_type,
        severity: event.severity,
        delta: event.delta,
        suggested_fix: event.suggested_fix,
        status: event.status,
      });
    } catch {
      // Graceful fallback
    }
  }

  public destroy(): void {
    if (this.commsLossCheckTimer) {
      clearInterval(this.commsLossCheckTimer);
      this.commsLossCheckTimer = null;
    }
  }
}

// Global Singleton Anomaly Detector instance
const globalAnomalyDetectorKey = Symbol.for("omnimonitor.anomaly_detector");

export function getGlobalAnomalyDetector(): AnomalyDetector {
  const globalStore = globalThis as unknown as { [globalAnomalyDetectorKey]?: AnomalyDetector };
  if (!globalStore[globalAnomalyDetectorKey]) {
    globalStore[globalAnomalyDetectorKey] = new AnomalyDetector();
  }
  return globalStore[globalAnomalyDetectorKey]!;
}
