import { NextRequest, NextResponse } from "next/server";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";
import { getGlobalAnomalyDetector } from "@/lib/anomalies/detector";
import { getGlobalSimulator } from "@/lib/simulator/engine";
import { getGlobalAuditLog } from "@/lib/controller/auditLog";
import { SuggestedFix } from "@/types/replanning";
import { supabase } from "@/lib/supabase";
import { FaultSeverity } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  initializeTelemetryPipeline();
  const detector = getGlobalAnomalyDetector();
  const simulator = getGlobalSimulator();
  const auditLog = getGlobalAuditLog();

  try {
    const body = await req.json();
    const { fault_id, action, rejection_reason, override_notes, override_fix } = body;

    const allFaults = detector.getActiveFaults();
    const targetFault = allFaults.find((f) => f.id === fault_id);

    if (!targetFault) {
      return NextResponse.json({ error: `Fault '${fault_id}' not found among active pending faults.` }, { status: 404 });
    }

    if (action === "approve") {
      targetFault.status = "approved";
      const fix = (override_fix || targetFault.suggested_fix) as unknown as SuggestedFix;

      // Transmit trajectory to simulator or live drone
      if (fix && fix.waypoints && fix.waypoints.length >= 2) {
        simulator.applyFix(targetFault.drone_id, fix);
      }

      auditLog.recordDecision({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        drone_id: targetFault.drone_id,
        fault_type: targetFault.fault_type,
        severity: targetFault.severity as FaultSeverity,
        decision: "approved",
        fix_type: fix?.fix_type,
        estimated_duration_s: fix?.estimated_duration_s,
        safety_margin_m: fix?.safety_margin_m,
      });

      // Update in Supabase if configured
      if (supabase) {
        try {
          await supabase.from("fault_events").update({ status: "approved" }).eq("id", targetFault.id);
        } catch {}
      }

      return NextResponse.json({
        success: true,
        message: `Approved re-planning fix for ${targetFault.drone_id}. Trajectory is now actively executing.`,
        fault: targetFault,
      });
    }

    if (action === "reject") {
      targetFault.status = "rejected";
      targetFault.rejection_reason = rejection_reason || "Controller manual visual rejection";

      auditLog.recordDecision({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        drone_id: targetFault.drone_id,
        fault_type: targetFault.fault_type,
        severity: targetFault.severity as FaultSeverity,
        decision: "rejected",
        rejection_reason: targetFault.rejection_reason || undefined,
      });

      if (supabase) {
        try {
          await supabase
            .from("fault_events")
            .update({ status: "rejected", rejection_reason: targetFault.rejection_reason })
            .eq("id", targetFault.id);
        } catch {}
      }

      return NextResponse.json({
        success: true,
        message: `Rejected suggested fix for ${targetFault.drone_id}. Logged reason: '${targetFault.rejection_reason}'`,
        fault: targetFault,
      });
    }

    if (action === "override") {
      targetFault.status = "approved";
      targetFault.rejection_reason = override_notes || "Manual controller override";

      auditLog.recordDecision({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        drone_id: targetFault.drone_id,
        fault_type: targetFault.fault_type,
        severity: targetFault.severity as FaultSeverity,
        decision: "overridden",
        override_notes: override_notes || "Manual controller override",
      });

      return NextResponse.json({
        success: true,
        message: `Manual override logged for ${targetFault.drone_id}.`,
        fault: targetFault,
      });
    }

    return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to process controller action", details: String(err) }, { status: 500 });
  }
}
