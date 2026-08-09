import { TelemetryEvent, FaultEvent } from "./database";

export interface FleetDroneLiveState {
  drone_id: string;
  label: string;
  last_telemetry: TelemetryEvent | null;
  last_seen_at: string;
  health_score: number; // 0 - 100
  active_faults: FaultEvent[];
  is_stale: boolean;
}

export interface IngestionMetrics {
  total_received: number;
  events_per_second: number;
  dropped_or_malformed: number;
  last_event_ts: string | null;
}
