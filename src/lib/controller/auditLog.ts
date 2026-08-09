import { AuditLogEntry } from "@/types/controller";

export class AuditLogManager {
  private history: AuditLogEntry[] = [];
  private maxEntries = 200;

  public recordDecision(entry: AuditLogEntry): void {
    this.history.unshift(entry);
    if (this.history.length > this.maxEntries) {
      this.history.pop();
    }
  }

  public getHistory(): AuditLogEntry[] {
    return [...this.history];
  }

  public clear(): void {
    this.history = [];
  }

  public exportJSON(): string {
    return JSON.stringify(
      {
        session_exported_at: new Date().toISOString(),
        total_decisions: this.history.length,
        entries: this.history,
      },
      null,
      2
    );
  }

  public exportCSV(): string {
    const headers = [
      "ID",
      "Timestamp",
      "Drone ID",
      "Fault Type",
      "Severity",
      "Decision",
      "Fix Type",
      "Duration (s)",
      "Safety Margin (m)",
      "Rejection Reason / Notes",
    ];

    const rows = this.history.map((e) => [
      `"${e.id}"`,
      `"${e.timestamp}"`,
      `"${e.drone_id}"`,
      `"${e.fault_type}"`,
      `"${e.severity}"`,
      `"${e.decision}"`,
      `"${e.fix_type || "N/A"}"`,
      `"${e.estimated_duration_s ?? ""}"`,
      `"${e.safety_margin_m ?? ""}"`,
      `"${(e.rejection_reason || e.override_notes || "").replace(/"/g, '""')}"`,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}

// Global Singleton Audit Log Manager
const globalAuditLogKey = Symbol.for("omnimonitor.audit_log");

export function getGlobalAuditLog(): AuditLogManager {
  const globalStore = globalThis as unknown as { [globalAuditLogKey]?: AuditLogManager };
  if (!globalStore[globalAuditLogKey]) {
    globalStore[globalAuditLogKey] = new AuditLogManager();
  }
  return globalStore[globalAuditLogKey]!;
}
