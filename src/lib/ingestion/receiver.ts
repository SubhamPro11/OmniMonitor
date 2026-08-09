import { TelemetryEvent } from "@/types/database";
import { IngestionMetrics } from "@/types/telemetry";
import { supabase } from "@/lib/supabase";

export interface MalformedEventLog {
  timestamp: string;
  payloadSnippet: string;
  reason: string;
}

/**
 * Telemetry Ingestion Receiver (Section 2)
 * Subscribes to the live telemetry stream, validates schemas, computes ingestion rates,
 * buffers recent events, and persists to Supabase (or local fallback).
 * Never fails silently: logs and records any malformed/dropped packet.
 */
export class IngestionReceiver {
  private latestPerDrone: Map<string, TelemetryEvent> = new Map();
  private recentBuffer: TelemetryEvent[] = [];
  private maxBufferSize: number = 200;

  private totalReceived: number = 0;
  private droppedOrMalformed: number = 0;
  private lastEventTs: string | null = null;
  private malformedLogs: MalformedEventLog[] = [];
  private maxErrorLogs: number = 50;

  // Rate estimation (sliding 1-second ticks)
  private eventTimestamps: number[] = [];
  private currentRateHz: number = 0;

  constructor() {
    // Prune timestamp rate window periodically
    setInterval(() => {
      this.recomputeRate();
    }, 500);
  }

  public validateEvent(event: unknown): { isValid: boolean; reason?: string } {
    if (!event || typeof event !== "object") {
      return { isValid: false, reason: "Payload is not an object or is null" };
    }

    const e = event as Partial<TelemetryEvent>;

    if (!e.drone_id || typeof e.drone_id !== "string") {
      return { isValid: false, reason: "Missing or invalid 'drone_id' string" };
    }
    if (!e.ts || typeof e.ts !== "string") {
      return { isValid: false, reason: "Missing or invalid 'ts' timestamp string" };
    }
    if (!e.position || typeof e.position.alt_m !== "number") {
      return { isValid: false, reason: "Missing or invalid 'position.alt_m' coordinate" };
    }
    if (!e.battery || typeof e.battery.pct !== "number" || typeof e.battery.voltage !== "number") {
      return { isValid: false, reason: "Missing or invalid 'battery' structure (pct / voltage)" };
    }
    if (!e.imu || typeof e.imu.pitch !== "number" || typeof e.imu.roll !== "number") {
      return { isValid: false, reason: "Missing or invalid 'imu' attitude coordinates" };
    }
    if (!e.link_quality || typeof e.link_quality.rssi_dbm !== "number") {
      return { isValid: false, reason: "Missing or invalid 'link_quality.rssi_dbm'" };
    }
    if (!Array.isArray(e.motor_temp) || e.motor_temp.length === 0) {
      return { isValid: false, reason: "Missing or invalid 'motor_temp' array" };
    }
    if (!e.gps_fix || typeof e.gps_fix !== "string") {
      return { isValid: false, reason: "Missing or invalid 'gps_fix' string" };
    }

    return { isValid: true };
  }

  public ingest(rawEvent: unknown): boolean {
    const now = Date.now();
    const validation = this.validateEvent(rawEvent);

    if (!validation.isValid) {
      this.droppedOrMalformed++;
      const reason = validation.reason || "Unknown schema violation";
      const snippet = JSON.stringify(rawEvent).slice(0, 140);
      
      const errorLog: MalformedEventLog = {
        timestamp: new Date().toISOString(),
        payloadSnippet: snippet,
        reason,
      };

      this.malformedLogs.unshift(errorLog);
      if (this.malformedLogs.length > this.maxErrorLogs) {
        this.malformedLogs.pop();
      }

      // Safety rule: Never fail silently
      console.warn(`[INGESTION ERROR] Malformed telemetry rejected: ${reason}`, snippet);
      return false;
    }

    const event = rawEvent as TelemetryEvent;
    this.totalReceived++;
    this.lastEventTs = event.ts;
    this.eventTimestamps.push(now);

    // Update in-memory live table state
    this.latestPerDrone.set(event.drone_id, event);

    // Append to ring buffer
    this.recentBuffer.push(event);
    if (this.recentBuffer.length > this.maxBufferSize) {
      this.recentBuffer.shift();
    }

    // Persist to Supabase if configured and online
    this.persistToSupabase(event);

    return true;
  }

  public ingestBatch(events: unknown[]): { ingested: number; failed: number } {
    let ingested = 0;
    let failed = 0;
    for (const evt of events) {
      if (this.ingest(evt)) {
        ingested++;
      } else {
        failed++;
      }
    }
    return { ingested, failed };
  }

  public getLatestSnapshot(): TelemetryEvent[] {
    return Array.from(this.latestPerDrone.values()).sort((a, b) =>
      a.drone_id.localeCompare(b.drone_id)
    );
  }

  public getDroneTelemetry(droneId: string): TelemetryEvent | null {
    return this.latestPerDrone.get(droneId) || null;
  }

  public getMetrics(): IngestionMetrics & { malformedLogs: MalformedEventLog[]; activeDrones: number } {
    this.recomputeRate();
    return {
      total_received: this.totalReceived,
      events_per_second: this.currentRateHz,
      dropped_or_malformed: this.droppedOrMalformed,
      last_event_ts: this.lastEventTs,
      activeDrones: this.latestPerDrone.size,
      malformedLogs: [...this.malformedLogs],
    };
  }

  private recomputeRate(): void {
    const oneSecAgo = Date.now() - 1000;
    this.eventTimestamps = this.eventTimestamps.filter((t) => t >= oneSecAgo);
    this.currentRateHz = this.eventTimestamps.length;
  }

  private async persistToSupabase(event: TelemetryEvent): Promise<void> {
    if (!supabase) return;

    try {
      // Fire-and-forget async insert with non-blocking error handling
      const { error } = await supabase.from("telemetry_events").insert({
        drone_id: event.drone_id,
        ts: event.ts,
        position: event.position,
        velocity: event.velocity,
        battery: event.battery,
        imu: event.imu,
        link_quality: event.link_quality,
        motor_temp: event.motor_temp,
        gps_fix: event.gps_fix,
        flight_mode: event.flight_mode,
      });

      if (error) {
        // Log explicitly, never swallow
        console.warn(`[SUPABASE TELEMETRY PERSISTENCE WARNING]: ${error.message}`);
      }
    } catch (err) {
      console.warn("[SUPABASE TELEMETRY NETWORK WARNING]:", err);
    }
  }
}

const globalIngestionKey = Symbol.for("omnimonitor.ingestion");

export function getGlobalIngestion(): IngestionReceiver {
  const globalStore = globalThis as unknown as { [globalIngestionKey]?: IngestionReceiver };
  if (!globalStore[globalIngestionKey]) {
    globalStore[globalIngestionKey] = new IngestionReceiver();
  }
  return globalStore[globalIngestionKey]!;
}
