/**
 * OmniMonitor Live Stream Consumer & Fault Detector
 * Read-only consumer observing incoming 5Hz telemetry packets, maintaining per-drone rolling history,
 * and emitting classified fault events to the FaultEventBus.
 */

import { TelemetryEvent, WaypointPosition } from "@/types/database";
import { FaultEventPayload } from "@/types/faults";
import { FaultEngineConfig, DEFAULT_FAULT_CONFIG } from "./config";
import { MetricDebouncer } from "./debouncer";
import { SingleDroneEvaluator } from "./singleDroneEvaluator";
import { SwarmEvaluator, DroneSwarmSnapshot } from "./swarmEvaluator";
import { FaultEventBus, getGlobalFaultEventBus } from "./eventBus";

export interface StreamPerformanceMetrics {
  total_packets_evaluated: number;
  total_swarm_ticks_evaluated: number;
  total_faults_emitted: number;
  avg_packet_eval_latency_us: number; // in microseconds
  max_packet_eval_latency_us: number;
  history_buffer_count: number;
}

export class LiveFaultDetector {
  private config: FaultEngineConfig;
  private debouncer: MetricDebouncer;
  private singleEvaluator: SingleDroneEvaluator;
  private swarmEvaluator: SwarmEvaluator;
  private eventBus: FaultEventBus;

  // Rolling per-drone telemetry packet history (capped at history_buffer_size)
  private droneHistories: Map<string, TelemetryEvent[]> = new Map();
  // Timestamp map of when each drone was last seen
  private lastSeenMsMap: Map<string, number> = new Map();

  // Performance telemetry
  private totalPacketsEvaluated: number = 0;
  private totalSwarmTicksEvaluated: number = 0;
  private totalFaultsEmitted: number = 0;
  private totalEvalTimeUs: number = 0;
  private maxEvalLatencyUs: number = 0;

  constructor(
    config: FaultEngineConfig = DEFAULT_FAULT_CONFIG,
    eventBus?: FaultEventBus
  ) {
    this.config = config;
    this.debouncer = new MetricDebouncer();
    this.singleEvaluator = new SingleDroneEvaluator(this.config, this.debouncer);
    this.swarmEvaluator = new SwarmEvaluator(this.config, this.debouncer);
    this.eventBus = eventBus || getGlobalFaultEventBus();
  }

  public updateConfig(newConfig: Partial<FaultEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.singleEvaluator.updateConfig(this.config);
    this.swarmEvaluator.updateConfig(this.config);
  }

  public getConfig(): FaultEngineConfig {
    return this.config;
  }

  public getEventBus(): FaultEventBus {
    return this.eventBus;
  }

  /**
   * Read-only consumer: observes an incoming telemetry packet from a drone,
   * maintains the bounded rolling history buffer, evaluates single-drone rules,
   * and emits any detected faults to the FaultEventBus.
   */
  public processPacket(
    packet: TelemetryEvent,
    intendedPosition?: WaypointPosition | null,
    nowMs: number = Date.now()
  ): FaultEventPayload[] {
    const startHr = process.hrtime();
    const droneId = packet.drone_id;

    // 1. Maintain rolling history buffer (strictly read-only clone of packet)
    let history = this.droneHistories.get(droneId);
    if (!history) {
      history = [];
      this.droneHistories.set(droneId, history);
    }

    const lastSeenMs = this.lastSeenMsMap.get(droneId);
    this.lastSeenMsMap.set(droneId, nowMs);

    // 2. Evaluate single-drone rules against taxonomy
    const faults = this.singleEvaluator.evaluate({
      packet,
      intendedPosition,
      history: [...history],
      lastSeenMs,
      nowMs,
    });

    // 3. Append to rolling history (max size from config)
    history.push(packet);
    if (history.length > this.config.history_buffer_size) {
      history.shift();
    }

    // 4. Emit detected faults to event bus
    if (faults.length > 0) {
      this.eventBus.emitBatch(faults);
      this.totalFaultsEmitted += faults.length;
    }

    // 5. Record evaluation performance metrics
    const [diffSec, diffNano] = process.hrtime(startHr);
    const latencyUs = diffSec * 1000000 + diffNano / 1000;
    this.totalPacketsEvaluated++;
    this.totalEvalTimeUs += latencyUs;
    if (latencyUs > this.maxEvalLatencyUs) {
      this.maxEvalLatencyUs = latencyUs;
    }

    return faults;
  }

  /**
   * Evaluates swarm-wide cross-drone metrics across the active fleet snapshot.
   */
  public processSwarmTick(
    snapshots: DroneSwarmSnapshot[],
    nowMs: number = Date.now()
  ): FaultEventPayload[] {
    const faults = this.swarmEvaluator.evaluate({
      droneSnapshots: snapshots,
      nowMs,
    });

    if (faults.length > 0) {
      this.eventBus.emitBatch(faults);
      this.totalFaultsEmitted += faults.length;
    }

    this.totalSwarmTicksEvaluated++;
    return faults;
  }

  /**
   * Retrieves current performance and latency metrics.
   */
  public getPerformanceMetrics(): StreamPerformanceMetrics {
    return {
      total_packets_evaluated: this.totalPacketsEvaluated,
      total_swarm_ticks_evaluated: this.totalSwarmTicksEvaluated,
      total_faults_emitted: this.totalFaultsEmitted,
      avg_packet_eval_latency_us:
        this.totalPacketsEvaluated > 0
          ? Number((this.totalEvalTimeUs / this.totalPacketsEvaluated).toFixed(2))
          : 0,
      max_packet_eval_latency_us: Number(this.maxEvalLatencyUs.toFixed(2)),
      history_buffer_count: this.droneHistories.size,
    };
  }

  /**
   * Retrieves the rolling packet history for a specific drone.
   */
  public getDroneHistory(droneId: string): TelemetryEvent[] {
    return [...(this.droneHistories.get(droneId) || [])];
  }

  /**
   * Clears state and histories (e.g. on show reset).
   */
  public reset(): void {
    this.droneHistories.clear();
    this.lastSeenMsMap.clear();
    this.debouncer.clearAll();
    this.eventBus.clearAll();
  }
}

const globalDetectorKey = Symbol.for("omnimonitor.live_fault_detector");

export function getGlobalLiveFaultDetector(): LiveFaultDetector {
  const globalStore = globalThis as unknown as { [globalDetectorKey]?: LiveFaultDetector };
  if (!globalStore[globalDetectorKey]) {
    globalStore[globalDetectorKey] = new LiveFaultDetector();
  }
  return globalStore[globalDetectorKey]!;
}
