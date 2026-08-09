import { TelemetryEvent, TelemetryPosition, TelemetryVelocity, TelemetryBattery, TelemetryImu, TelemetryLink } from "@/types/database";
import { TrajectoryInterpolator } from "../sync/interpolator";
import { NormalizedShowPlan } from "@/types/showPlan";

export interface SimulatorFaultState {
  battery_override?: number; // e.g. 12%
  drift_offset?: { x: number; y: number; z: number }; // meters
  packet_loss_override?: number; // e.g. 85%
  link_killed?: boolean; // true = complete signal loss
  motor_temp_spike?: { motor_index: number; temp_c: number }; // e.g. motor 0 @ 88C
}

export interface SimulatorConfig {
  drone_count: number;
  frequency_hz: number; // default 5Hz
  base_lat: number;
  base_lon: number;
  base_alt_m: number;
}

export type TelemetryCallback = (event: TelemetryEvent) => void;
export type TelemetryBatchCallback = (events: TelemetryEvent[]) => void;

/**
 * Lightweight Fleet Simulator (Section 2)
 * Simulates N drones flying a circular expanding/contracting show choreography at ~5Hz per drone.
 * Fully supports non-hardcoded dynamic fault injections.
 */
export class DroneFleetSimulator {
  private config: SimulatorConfig;
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private startTimeMs: number = Date.now();
  private faults: Map<string, SimulatorFaultState> = new Map();
  private telemetryListeners: Set<TelemetryCallback> = new Set();
  private batchListeners: Set<TelemetryBatchCallback> = new Set();

  // Baseline battery levels per drone (starts 96-99%)
  private batteryLevels: Map<string, number> = new Map();

  constructor(config?: Partial<SimulatorConfig>) {
    this.config = {
      drone_count: config?.drone_count ?? 12,
      frequency_hz: config?.frequency_hz ?? 5,
      base_lat: config?.base_lat ?? 37.774929,
      base_lon: config?.base_lon ?? -122.419416,
      base_alt_m: config?.base_alt_m ?? 35.0,
    };

    // Initialize battery levels
    for (let i = 1; i <= this.config.drone_count; i++) {
      const droneId = `DRONE-${String(i).padStart(2, "0")}`;
      this.batteryLevels.set(droneId, 96 + (i % 4));
    }
  }

  public getConfig(): SimulatorConfig {
    return { ...this.config };
  }

  public setDroneCount(count: number): void {
    this.config.drone_count = Math.max(1, Math.min(100, count));
    for (let i = 1; i <= this.config.drone_count; i++) {
      const droneId = `DRONE-${String(i).padStart(2, "0")}`;
      if (!this.batteryLevels.has(droneId)) {
        this.batteryLevels.set(droneId, 98.0);
      }
    }
  }

  public onTelemetry(callback: TelemetryCallback): () => void {
    this.telemetryListeners.add(callback);
    return () => this.telemetryListeners.delete(callback);
  }

  public onBatch(callback: TelemetryBatchCallback): () => void {
    this.batchListeners.add(callback);
    return () => this.batchListeners.delete(callback);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTimeMs = Date.now();
    const intervalMs = Math.round(1000 / this.config.frequency_hz);

    this.intervalTimer = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  // --- Fault Injection API ---

  public injectBattery(droneId: string, pct: number): void {
    const current = this.faults.get(droneId) || {};
    this.faults.set(droneId, { ...current, battery_override: pct });
  }

  public injectPositionDrift(droneId: string, dx: number, dy: number, dz: number): void {
    const current = this.faults.get(droneId) || {};
    this.faults.set(droneId, { ...current, drift_offset: { x: dx, y: dy, z: dz } });
  }

  public injectPacketLoss(droneId: string, pct: number): void {
    const current = this.faults.get(droneId) || {};
    this.faults.set(droneId, { ...current, packet_loss_override: pct });
  }

  public killLink(droneId: string, isKilled: boolean = true): void {
    const current = this.faults.get(droneId) || {};
    this.faults.set(droneId, { ...current, link_killed: isKilled });
  }

  public injectMotorTemp(droneId: string, motorIndex: number, tempC: number): void {
    const current = this.faults.get(droneId) || {};
    this.faults.set(droneId, { ...current, motor_temp_spike: { motor_index: motorIndex, temp_c: tempC } });
  }

  public resetFaults(droneId: string): void {
    this.faults.delete(droneId);
  }

  public resetAllFaults(): void {
    this.faults.clear();
  }

  public getActiveFaults(): Record<string, SimulatorFaultState> {
    const result: Record<string, SimulatorFaultState> = {};
    this.faults.forEach((fault, id) => {
      result[id] = { ...fault };
    });
    return result;
  }

  private activeShowPlan: NormalizedShowPlan | null = null;

  public loadShowPlan(plan: NormalizedShowPlan | null): void {
    this.activeShowPlan = plan;
    if (plan) {
      this.setDroneCount(plan.drone_count);
    }
  }

  private executingFixes: Map<string, { waypoints: Array<{ x: number; y: number; z: number; t_offset_ms: number }>; startMs: number; durationMs: number }> = new Map();

  public applyFix(
    droneId: string,
    fix: { waypoints: Array<{ x: number; y: number; z: number; t_offset_ms: number }>; estimated_duration_s: number }
  ): void {
    if (fix && fix.waypoints && fix.waypoints.length >= 2) {
      this.executingFixes.set(droneId, {
        waypoints: fix.waypoints,
        startMs: Date.now(),
        durationMs: (fix.estimated_duration_s || 5.0) * 1000,
      });
      // Clear link killed or extreme drift faults as fix is now actively executed
      this.faults.delete(droneId);
    }
  }

  public getExecutingFixes(): Record<string, { duration_remaining_s: number }> {
    const res: Record<string, { duration_remaining_s: number }> = {};
    const now = Date.now();
    this.executingFixes.forEach((state, id) => {
      const elapsed = now - state.startMs;
      const remaining = Math.max(0, (state.durationMs - elapsed) / 1000);
      res[id] = { duration_remaining_s: Number(remaining.toFixed(1)) };
    });
    return res;
  }

  // --- Generation Logic ---

  private tick(): void {
    const nowMs = Date.now();
    const elapsedSec = (nowMs - this.startTimeMs) / 1000;
    const batch: TelemetryEvent[] = [];

    // Flight choreography physics:
    // Expanding & contracting circle with rotation and altitude oscillation
    const omega = 0.25; // rotation speed (rad/sec)
    const pulseOmega = 0.15; // expansion pulse (rad/sec)
    const baseRadius = 16.0; // meters
    const radiusMod = 6.0 * Math.sin(pulseOmega * elapsedSec);
    const radius = baseRadius + radiusMod;

    const N = this.config.drone_count;

    for (let i = 1; i <= N; i++) {
      const droneId = `DRONE-${String(i).padStart(2, "0")}`;
      const fault = this.faults.get(droneId);

      // If link is completely killed, the drone stops transmitting telemetry
      if (fault?.link_killed) {
        continue;
      }

      const angleOffset = (2 * Math.PI * (i - 1)) / N;
      const currentAngle = angleOffset + omega * elapsedSec;

      let x = 0;
      let y = 0;
      let z = this.config.base_alt_m;
      let vx = 0;
      let vy = 0;
      const vz = 4.0 * pulseOmega * Math.cos(pulseOmega * elapsedSec + i * 0.5);

      const activeFix = this.executingFixes.get(droneId);
      if (activeFix) {
        const elapsedFix = nowMs - activeFix.startMs;
        if (elapsedFix >= activeFix.durationMs) {
          const lastWp = activeFix.waypoints[activeFix.waypoints.length - 1];
          x = lastWp.x;
          y = lastWp.y;
          z = lastWp.z;
          this.executingFixes.delete(droneId);
        } else {
          const totalWps = activeFix.waypoints;
          const alpha = elapsedFix / activeFix.durationMs;
          const targetIndex = Math.min(totalWps.length - 1, Math.floor(alpha * (totalWps.length - 1)));
          const nextIndex = Math.min(totalWps.length - 1, targetIndex + 1);
          const w0 = totalWps[targetIndex];
          const w1 = totalWps[nextIndex];
          const segAlpha = alpha * (totalWps.length - 1) - targetIndex;
          x = w0.x + segAlpha * (w1.x - w0.x);
          y = w0.y + segAlpha * (w1.y - w0.y);
          z = w0.z + segAlpha * (w1.z - w0.z);
        }
      } else if (this.activeShowPlan && this.activeShowPlan.waypoints_by_drone[droneId]) {
        const tShowMs = (elapsedSec * 1000) % (this.activeShowPlan.duration_ms || 60000);
        const interp = TrajectoryInterpolator.interpolateDrone(
          this.activeShowPlan.waypoints_by_drone[droneId],
          tShowMs
        );
        if (interp) {
          x = (interp.position.x ?? 0) + (Math.random() - 0.5) * 0.1; // minor flight turbulence
          y = (interp.position.y ?? 0) + (Math.random() - 0.5) * 0.1;
          z = (interp.position.z ?? interp.position.alt_m ?? 20.0) + (Math.random() - 0.5) * 0.05;
        }
      } else {
        x = radius * Math.cos(currentAngle);
        y = radius * Math.sin(currentAngle);
        z = this.config.base_alt_m + 4.0 * Math.sin(pulseOmega * elapsedSec + i * 0.5);

        const vTangential = radius * omega;
        vx = -vTangential * Math.sin(currentAngle);
        vy = vTangential * Math.cos(currentAngle);
      }

      // Apply position drift fault if active
      if (fault?.drift_offset) {
        x += fault.drift_offset.x;
        y += fault.drift_offset.y;
        z += fault.drift_offset.z;
        vx += fault.drift_offset.x * 0.2;
        vy += fault.drift_offset.y * 0.2;
      }

      // Convert local relative meters to approximate GPS coordinates
      // 1 deg latitude ~ 111,139 meters; 1 deg longitude ~ 111,139 * cos(lat)
      const latOffset = y / 111139.0;
      const lonOffset = x / (111139.0 * Math.cos((this.config.base_lat * Math.PI) / 180));
      const lat = Number((this.config.base_lat + latOffset).toFixed(7));
      const lon = Number((this.config.base_lon + lonOffset).toFixed(7));
      const alt_m = Number(z.toFixed(2));

      const position: TelemetryPosition = {
        lat,
        lon,
        alt_m,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: Number(z.toFixed(2)),
      };

      const velocity: TelemetryVelocity = {
        x: Number(vx.toFixed(2)),
        y: Number(vy.toFixed(2)),
        z: Number(vz.toFixed(2)),
      };

      // Battery modeling: gradual discharge with current load (~14A)
      let currentBatteryPct = this.batteryLevels.get(droneId) ?? 95.0;
      currentBatteryPct = Math.max(0, currentBatteryPct - 0.015); // gentle normal discharge
      this.batteryLevels.set(droneId, currentBatteryPct);

      if (fault?.battery_override !== undefined) {
        currentBatteryPct = fault.battery_override;
      }

      const voltage = Number((14.8 + (currentBatteryPct / 100) * 2.4).toFixed(2)); // 4S LiPo 14.8V - 17.2V
      const current_a = Number((12.5 + Math.random() * 2.0).toFixed(1));

      const battery: TelemetryBattery = {
        voltage,
        current_a,
        pct: Number(currentBatteryPct.toFixed(1)),
      };

      // IMU modeling: calculated bank angle from acceleration/rotation
      const pitch = Number((Math.sin(currentAngle) * 3.5 + (Math.random() - 0.5) * 0.4).toFixed(1));
      const roll = Number((-Math.cos(currentAngle) * 4.0 + (Math.random() - 0.5) * 0.4).toFixed(1));
      let yaw = Number((((currentAngle * 180) / Math.PI) % 360).toFixed(1));
      if (yaw < 0) yaw += 360;

      const imu: TelemetryImu = {
        pitch,
        roll,
        yaw,
      };

      // Link quality: RSSI with small natural jitter + packet loss
      let rssi_dbm = Math.round(-62 - (radius / 25) * 8 + (Math.random() - 0.5) * 4);
      let packet_loss_pct = Number((0.1 + Math.random() * 0.3).toFixed(1));

      if (fault?.packet_loss_override !== undefined) {
        packet_loss_pct = fault.packet_loss_override;
        rssi_dbm = Math.min(rssi_dbm, -88); // degraded signal
      }

      const link: TelemetryLink = {
        rssi_dbm,
        packet_loss_pct,
      };

      // Motor temps: 4 motors hovering at 44-48C
      const motor_temp = [
        Number((45.0 + Math.random() * 1.5).toFixed(1)),
        Number((45.5 + Math.random() * 1.5).toFixed(1)),
        Number((44.8 + Math.random() * 1.5).toFixed(1)),
        Number((46.2 + Math.random() * 1.5).toFixed(1)),
      ];

      if (fault?.motor_temp_spike) {
        const mIdx = Math.max(0, Math.min(3, fault.motor_temp_spike.motor_index));
        motor_temp[mIdx] = fault.motor_temp_spike.temp_c;
      }

      const event: TelemetryEvent = {
        drone_id: droneId,
        ts: new Date(nowMs).toISOString(),
        position,
        velocity,
        battery,
        imu,
        link_quality: link,
        motor_temp,
        gps_fix: "RTK_FIXED",
        flight_mode: "SHOW",
      };

      batch.push(event);
      this.telemetryListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error("Telemetry listener error:", err);
        }
      });
    }

    if (batch.length > 0) {
      this.batchListeners.forEach((listener) => {
        try {
          listener(batch);
        } catch (err) {
          console.error("Telemetry batch listener error:", err);
        }
      });
    }
  }
}

const globalSimulatorKey = Symbol.for("omnimonitor.simulator");

export function getGlobalSimulator(): DroneFleetSimulator {
  const globalStore = globalThis as unknown as { [globalSimulatorKey]?: DroneFleetSimulator };
  if (!globalStore[globalSimulatorKey]) {
    globalStore[globalSimulatorKey] = new DroneFleetSimulator({ drone_count: 12, frequency_hz: 5 });
    globalStore[globalSimulatorKey].start();
  }
  return globalStore[globalSimulatorKey]!;
}
