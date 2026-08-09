import { NextRequest } from "next/server";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";
import { getGlobalIngestion } from "@/lib/ingestion/receiver";
import { getGlobalSimulator } from "@/lib/simulator/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  initializeTelemetryPipeline();
  const receiver = getGlobalIngestion();
  const simulator = getGlobalSimulator();

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connected event
  writer.write(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "INITIAL_STATE",
        telemetry: receiver.getLatestSnapshot(),
        metrics: receiver.getMetrics(),
        activeFaults: simulator.getActiveFaults(),
      })}\n\n`
    )
  );

  // Subscribe to live telemetry batch emissions
  const unsubscribe = simulator.onBatch((batch) => {
    try {
      const payload = JSON.stringify({
        type: "TELEMETRY_UPDATE",
        batch,
        metrics: receiver.getMetrics(),
        activeFaults: simulator.getActiveFaults(),
      });
      writer.write(encoder.encode(`data: ${payload}\n\n`));
    } catch {
      // Client disconnected
      unsubscribe();
    }
  });

  // Handle client abort / disconnect
  req.signal.addEventListener("abort", () => {
    unsubscribe();
    try {
      writer.close();
    } catch {
      // Already closed
    }
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
