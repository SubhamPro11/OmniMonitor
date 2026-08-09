import { NextRequest, NextResponse } from "next/server";
import { getGlobalMonitoringEngine } from "@/lib/sync/monitoringEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const monitoring = getGlobalMonitoringEngine();

  try {
    const body = await req.json();
    const { action, time_ms } = body;

    switch (action) {
      case "start":
        monitoring.startShow();
        return NextResponse.json({ success: true, is_running: true });

      case "pause":
        monitoring.pauseShow();
        return NextResponse.json({ success: true, is_running: false });

      case "seek":
        monitoring.setShowTimeMs(typeof time_ms === "number" ? time_ms : 0);
        return NextResponse.json({ success: true, show_time_ms: monitoring.getCurrentShowTimeMs() });

      case "reset":
        monitoring.resetShowClock();
        return NextResponse.json({ success: true, show_time_ms: 0, is_running: false });

      default:
        return NextResponse.json({ error: `Unknown clock action '${action}'` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: "Failed to parse clock request", details: String(err) }, { status: 500 });
  }
}
