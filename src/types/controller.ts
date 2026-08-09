import { FaultSeverity } from "./database";

export type ControllerDecision = "approved" | "rejected" | "overridden";

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO-8601 UTC
  drone_id: string;
  fault_type: string;
  severity: FaultSeverity | "warning" | "critical";
  decision: ControllerDecision;
  rejection_reason?: string | null;
  override_notes?: string | null;
  fix_type?: string;
  estimated_duration_s?: number;
  safety_margin_m?: number;
}
