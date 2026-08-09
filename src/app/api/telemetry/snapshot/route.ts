import { NextResponse } from "next/server";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";
import { getGlobalIngestion } from "@/lib/ingestion/receiver";
import { getGlobalSimulator } from "@/lib/simulator/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  initializeTelemetryPipeline();
  const receiver = getGlobalIngestion();
  const simulator = getGlobalSimulator();

  return NextResponse.json({
    telemetry: receiver.getLatestSnapshot(),
    metrics: receiver.getMetrics(),
    activeFaults: simulator.getActiveFaults(),
    simulatorActive: simulator.isActive(),
  });
}
