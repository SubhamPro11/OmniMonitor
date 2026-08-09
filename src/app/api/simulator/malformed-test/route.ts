import { NextRequest, NextResponse } from "next/server";
import { getGlobalIngestion } from "@/lib/ingestion/receiver";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  initializeTelemetryPipeline();
  const receiver = getGlobalIngestion();

  try {
    const rawPayload = await req.json();
    const result = receiver.ingest(rawPayload);

    return NextResponse.json({
      success: result,
      message: result
        ? "Telemetry passed schema validation and was ingested."
        : "Telemetry was flagged as malformed/dropped and logged to ingestion metrics.",
      metrics: receiver.getMetrics(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON", details: String(err) }, { status: 400 });
  }
}
