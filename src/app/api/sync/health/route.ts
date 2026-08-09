import { NextResponse } from "next/server";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";
import { getGlobalMonitoringEngine } from "@/lib/sync/monitoringEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  initializeTelemetryPipeline();
  const monitoring = getGlobalMonitoringEngine();
  const snapshot = monitoring.getFleetSnapshot();

  return NextResponse.json(snapshot);
}
