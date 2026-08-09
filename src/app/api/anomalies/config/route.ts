import { NextRequest, NextResponse } from "next/server";
import { getGlobalAnomalyDetector } from "@/lib/anomalies/detector";

export const dynamic = "force-dynamic";

export async function GET() {
  const detector = getGlobalAnomalyDetector();
  return NextResponse.json(detector.getConfig());
}

export async function POST(req: NextRequest) {
  const detector = getGlobalAnomalyDetector();

  try {
    const newConfig = await req.json();
    detector.updateConfig(newConfig);

    return NextResponse.json({
      success: true,
      message: "Anomaly detection thresholds updated successfully.",
      config: detector.getConfig(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update anomaly config", details: String(err) }, { status: 400 });
  }
}
