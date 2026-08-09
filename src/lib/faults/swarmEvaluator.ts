/**
 * OmniMonitor Swarm-Level Fault Evaluation Engine
 * Evaluates cross-drone systemic anomalies (collision proximity, swarm RF interference, correlated wind drift).
 */

import crypto from "crypto";
import { TelemetryEvent, WaypointPosition } from "@/types/database";
import { FaultEventPayload, FaultType, FaultSeverity, TriggerMode } from "@/types/faults";
import { FaultEngineConfig, DEFAULT_FAULT_CONFIG } from "./config";
import { MetricDebouncer } from "./debouncer";

export interface DroneSwarmSnapshot {
  drone_id: string;
  packet: TelemetryEvent;
  intendedPosition?: WaypointPosition | null;
}

export interface SwarmEvaluationContext {
  droneSnapshots: DroneSwarmSnapshot[];
  singleDroneFaults?: FaultEventPayload[];
  nowMs?: number;
}

export class SwarmEvaluator {
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
   * Main evaluation entry point for swarm-wide cross-drone analysis.
   * Executed after per-drone evaluation has completed for the current tick.
   */
  public evaluate(context: SwarmEvaluationContext): FaultEventPayload[] {
    const { droneSnapshots, nowMs = Date.now() } = context;
    const faults: FaultEventPayload[] = [];
    const timestamp = new Date(nowMs).toISOString();

    if (!droneSnapshots || droneSnapshots.length === 0) {
      return faults;
    }

    const createSwarmFault = (
      faultType: FaultType,
      severity: FaultSeverity,
      triggerMode: TriggerMode,
      metricName: string,
      observedValue: number | string,
      thresholdValue: number | string,
      unit: string,
      consecutiveBreaches: number,
      description: string,
      involvedDroneIds: string[]
    ): FaultEventPayload => {
      return {
        id: crypto.randomUUID(),
        drone_id: involvedDroneIds.length > 0 ? involvedDroneIds[0] : "SWARM",
        involved_drone_ids: involvedDroneIds,
        timestamp,
        category: "swarm",
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
    // 1. Pairwise Collision Proximity Detection (Spatial 3D Distance Matrix)
    // =========================================================================
    const activePositions = droneSnapshots.filter(
      (s) => s.packet.position && s.packet.position.x !== undefined && s.packet.position.y !== undefined
    );

    for (let i = 0; i < activePositions.length; i++) {
      for (let j = i + 1; j < activePositions.length; j++) {
        const droneA = activePositions[i];
        const droneB = activePositions[j];

        const ax = droneA.packet.position.x ?? 0;
        const ay = droneA.packet.position.y ?? 0;
        const az = droneA.packet.position.z ?? droneA.packet.position.alt_m ?? 0;

        const bx = droneB.packet.position.x ?? 0;
        const by = droneB.packet.position.y ?? 0;
        const bz = droneB.packet.position.z ?? droneB.packet.position.alt_m ?? 0;

        const dx = ax - bx;
        const dy = ay - by;
        const dz = az - bz;
        const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const pairKey = `collision:${[droneA.drone_id, droneB.drone_id].sort().join("_")}`;

        // Emergency Proximity Breach (Instant Critical)
        if (dist3d <= this.config.swarm.collision_emergency_separation_m) {
          faults.push(
            createSwarmFault(
              "COLLISION_PROXIMITY_CRIT",
              "critical",
              "instant",
              "separation_distance_3d",
              Number(dist3d.toFixed(2)),
              this.config.swarm.collision_emergency_separation_m,
              "m",
              1,
              `Emergency collision hazard: ${droneA.drone_id} and ${droneB.drone_id} separation closed to ${dist3d.toFixed(2)}m (<= ${this.config.swarm.collision_emergency_separation_m}m)`,
              [droneA.drone_id, droneB.drone_id]
            )
          );
        }
        // Warning Proximity Breach (Debounced)
        else if (dist3d <= this.config.swarm.collision_min_separation_m) {
          const count = this.debouncer.recordBreach("SWARM", pairKey, nowMs);
          if (count >= this.config.swarm.debounce_collision_warn) {
            faults.push(
              createSwarmFault(
                "COLLISION_PROXIMITY_WARN",
                "warning",
                "sustained",
                "separation_distance_3d",
                Number(dist3d.toFixed(2)),
                this.config.swarm.collision_min_separation_m,
                "m",
                count,
                `Proximity buffer warning: ${droneA.drone_id} and ${droneB.drone_id} separation closed to ${dist3d.toFixed(2)}m (threshold: ${this.config.swarm.collision_min_separation_m}m)`,
                [droneA.drone_id, droneB.drone_id]
              )
            );
          }
        } else {
          this.debouncer.recordNominal("SWARM", pairKey);
        }
      }
    }

    // =========================================================================
    // 2. Swarm-Wide RF Interference / Ground-Station Link Degradation
    // =========================================================================
    const totalActive = droneSnapshots.length;
    if (totalActive > 0) {
      const degradedDrones: string[] = [];

      for (const s of droneSnapshots) {
        if (s.packet.link_quality) {
          const loss = s.packet.link_quality.packet_loss_pct ?? 0;
          const rssi = s.packet.link_quality.rssi_dbm ?? -60;
          if (
            loss >= this.config.swarm.link_loss_packet_loss_threshold_pct ||
            rssi <= this.config.rf_link.rssi_degraded_dbm
          ) {
            degradedDrones.push(s.drone_id);
          }
        }
      }

      const degradedPct = (degradedDrones.length / totalActive) * 100;
      if (degradedPct >= this.config.swarm.link_degradation_fleet_pct) {
        const count = this.debouncer.recordBreach("SWARM", "swarm_link_loss", nowMs);
        if (count >= this.config.swarm.debounce_swarm_link) {
          faults.push(
            createSwarmFault(
              "SWARM_LINK_DEGRADATION",
              "critical",
              "sustained",
              "degraded_fleet_pct",
              Number(degradedPct.toFixed(1)),
              this.config.swarm.link_degradation_fleet_pct,
              "%",
              count,
              `Systemic RF interference detected: ${degradedPct.toFixed(1)}% of fleet (${degradedDrones.length}/${totalActive} drones) experiencing telemetry degradation — suspect ground-station RF issue`,
              degradedDrones
            )
          );
        }
      } else {
        this.debouncer.recordNominal("SWARM", "swarm_link_loss");
      }
    }

    // =========================================================================
    // 3. Correlated Multi-Drone Spatial Drift (Wind Shear / RTK Coordinate Offset)
    // =========================================================================
    const driftingDrones: { drone_id: string; vec: [number, number, number]; mag: number }[] = [];

    for (const s of droneSnapshots) {
      if (s.intendedPosition && s.packet.position) {
        const actX = s.packet.position.x ?? 0;
        const actY = s.packet.position.y ?? 0;
        const actZ = s.packet.position.z ?? s.packet.position.alt_m ?? 0;

        const intX = s.intendedPosition.x ?? actX;
        const intY = s.intendedPosition.y ?? actY;
        const intZ = s.intendedPosition.z ?? actZ;

        const vx = actX - intX;
        const vy = actY - intY;
        const vz = actZ - intZ;
        const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);

        if (mag >= this.config.swarm.correlated_drift_distance_m) {
          driftingDrones.push({
            drone_id: s.drone_id,
            vec: [vx, vy, vz],
            mag,
          });
        }
      }
    }

    if (driftingDrones.length >= this.config.swarm.correlated_drift_min_drones) {
      // Calculate average pairwise cosine similarity across drifting vectors
      let pairCount = 0;
      let totalCosineSim = 0;

      for (let i = 0; i < driftingDrones.length; i++) {
        for (let j = i + 1; j < driftingDrones.length; j++) {
          const vA = driftingDrones[i].vec;
          const vB = driftingDrones[j].vec;
          const magA = driftingDrones[i].mag;
          const magB = driftingDrones[j].mag;

          const dot = vA[0] * vB[0] + vA[1] * vB[1] + vA[2] * vB[2];
          const cosSim = dot / (magA * magB);
          totalCosineSim += cosSim;
          pairCount++;
        }
      }

      const avgSim = pairCount > 0 ? totalCosineSim / pairCount : 0;

      if (avgSim >= this.config.swarm.correlated_drift_cosine_similarity) {
        const count = this.debouncer.recordBreach("SWARM", "correlated_drift", nowMs);
        if (count >= this.config.swarm.debounce_swarm_drift) {
          const involved = driftingDrones.map((d) => d.drone_id);
          faults.push(
            createSwarmFault(
              "SWARM_CORRELATED_DRIFT",
              "warning",
              "sustained",
              "drift_vector_alignment",
              Number(avgSim.toFixed(2)),
              this.config.swarm.correlated_drift_cosine_similarity,
              "cos_sim",
              count,
              `Correlated multi-drone spatial drift detected across ${involved.length} drones (avg alignment: ${(avgSim * 100).toFixed(0)}%) — indicates systemic localized wind shear or RTK reference shift`,
              involved
            )
          );
        }
      } else {
        this.debouncer.recordNominal("SWARM", "correlated_drift");
      }
    } else {
      this.debouncer.recordNominal("SWARM", "correlated_drift");
    }

    return faults;
  }
}
