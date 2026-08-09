/**
 * OmniMonitor Fault Engine Cockpit Adapter & Session Audit Ledger
 * Bridges detection engine event payloads to the cockpit UI data contract,
 * and maintains the session audit trail without modifying cockpit components.
 */

import { FaultEventPayload } from "@/types/faults";
import { FaultEvent, FaultStatus } from "@/types/database";

export interface CockpitFaultEvent extends FaultEvent {
  category?: string;
  trigger_mode?: "instant" | "sustained";
  triggering_metrics?: {
    name: string;
    observed_value: number | string;
    threshold_value: number | string;
    unit: string;
  };
  involved_drone_ids?: string[];
  description?: string;
}

export interface SessionAuditRecord {
  audit_id: string;
  fault_id: string;
  drone_id: string;
  fault_type: string;
  severity: string;
  timestamp: string;
  action: "detected" | "operator_approved" | "operator_rejected" | "operator_override" | "auto_resolved";
  details: string;
  metadata?: Record<string, unknown>;
}

export class SessionFaultLedger {
  private auditLog: SessionAuditRecord[] = [];
  private maxLogEntries: number = 500;

  /**
   * Records an audit entry when a new fault is detected.
   */
  public recordDetection(fault: FaultEventPayload): void {
    const entry: SessionAuditRecord = {
      audit_id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fault_id: fault.id,
      drone_id: fault.drone_id,
      fault_type: fault.fault_type,
      severity: fault.severity,
      timestamp: fault.timestamp,
      action: "detected",
      details: fault.description,
      metadata: {
        category: fault.category,
        trigger_mode: fault.trigger_mode,
        metrics: fault.triggering_metrics,
        involved_drones: fault.involved_drone_ids,
      },
    };

    this.auditLog.unshift(entry);
    if (this.auditLog.length > this.maxLogEntries) {
      this.auditLog.pop();
    }
  }

  /**
   * Records an operator action or resolution against a fault.
   */
  public recordAction(
    faultId: string,
    droneId: string,
    action: "operator_approved" | "operator_rejected" | "operator_override" | "auto_resolved",
    details: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: SessionAuditRecord = {
      audit_id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fault_id: faultId,
      drone_id: droneId,
      fault_type: "OPERATOR_ACTION",
      severity: "info",
      timestamp: new Date().toISOString(),
      action,
      details,
      metadata,
    };

    this.auditLog.unshift(entry);
    if (this.auditLog.length > this.maxLogEntries) {
      this.auditLog.pop();
    }
  }

  /**
   * Retrieves all session audit records.
   */
  public getAuditRecords(limit: number = 100): SessionAuditRecord[] {
    return this.auditLog.slice(0, limit);
  }

  /**
   * Exports audit log as CSV.
   */
  public exportCsv(): string {
    const headers = ["Audit ID", "Timestamp", "Drone ID", "Action", "Fault Type", "Severity", "Details"];
    const rows = this.auditLog.map((r) => [
      r.audit_id,
      r.timestamp,
      r.drone_id,
      r.action,
      r.fault_type,
      r.severity,
      `"${r.details.replace(/"/g, '""')}"`,
    ]);
    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }

  public clear(): void {
    this.auditLog = [];
  }
}

/**
 * Transforms internal FaultEventPayload to the Cockpit UI FaultEvent shape.
 */
export function mapPayloadToCockpitEvent(payload: FaultEventPayload): CockpitFaultEvent {
  return {
    id: payload.id,
    drone_id: payload.drone_id,
    detected_at: payload.timestamp,
    fault_type: payload.fault_type as import("@/types/database").FaultType,
    severity: payload.severity,
    delta: {
      metric: payload.triggering_metrics.name,
      observed: payload.triggering_metrics.observed_value,
      threshold: payload.triggering_metrics.threshold_value,
      unit: payload.triggering_metrics.unit,
      consecutive_breaches: payload.consecutive_breaches,
    },
    status: payload.status as FaultStatus,
    category: payload.category,
    trigger_mode: payload.trigger_mode,
    triggering_metrics: payload.triggering_metrics,
    involved_drone_ids: payload.involved_drone_ids,
    description: payload.description,
    resolved_at: payload.resolved_at,
  };
}

const globalLedgerKey = Symbol.for("omnimonitor.session_fault_ledger");

export function getGlobalSessionLedger(): SessionFaultLedger {
  const globalStore = globalThis as unknown as { [globalLedgerKey]?: SessionFaultLedger };
  if (!globalStore[globalLedgerKey]) {
    globalStore[globalLedgerKey] = new SessionFaultLedger();
  }
  return globalStore[globalLedgerKey]!;
}
