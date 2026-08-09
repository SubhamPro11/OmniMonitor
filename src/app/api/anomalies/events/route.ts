import { NextResponse } from "next/server";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";
import { getGlobalAnomalyDetector } from "@/lib/anomalies/detector";

export const dynamic = "force-dynamic";

export async function GET() {
  initializeTelemetryPipeline();
  const detector = getGlobalAnomalyDetector();

  const activeFaults = detector.getActiveFaults();
  const history = detector.getEventHistory();

  return NextResponse.json({
    activeCount: activeFaults.length,
    activeFaults,
    history,
    config: detector.getConfig(),
  });
}
