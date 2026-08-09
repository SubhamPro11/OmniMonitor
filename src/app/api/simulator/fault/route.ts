import { NextRequest, NextResponse } from "next/server";
import { getGlobalSimulator } from "@/lib/simulator/engine";
import { initializeTelemetryPipeline } from "@/lib/simulator/hub";

export const dynamic = "force-dynamic";

export async function GET() {
  initializeTelemetryPipeline();
  const simulator = getGlobalSimulator();
  return NextResponse.json({
    activeFaults: simulator.getActiveFaults(),
  });
}

export async function POST(req: NextRequest) {
  initializeTelemetryPipeline();
  const simulator = getGlobalSimulator();

  try {
    const body = await req.json();
    const { action, drone_id, ...params } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing 'action' parameter" }, { status: 400 });
    }

    switch (action) {
      case "battery": {
        const pct = typeof params.pct === "number" ? params.pct : 15;
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.injectBattery(drone_id, pct);
        return NextResponse.json({ success: true, message: `Injected battery ${pct}% on ${drone_id}` });
      }

      case "drift": {
        const dx = typeof params.dx === "number" ? params.dx : 2.5;
        const dy = typeof params.dy === "number" ? params.dy : 1.8;
        const dz = typeof params.dz === "number" ? params.dz : 0.8;
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.injectPositionDrift(drone_id, dx, dy, dz);
        return NextResponse.json({ success: true, message: `Injected drift [${dx}m, ${dy}m, ${dz}m] on ${drone_id}` });
      }

      case "packet_loss": {
        const pct = typeof params.pct === "number" ? params.pct : 45;
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.injectPacketLoss(drone_id, pct);
        return NextResponse.json({ success: true, message: `Injected packet loss ${pct}% on ${drone_id}` });
      }

      case "kill_link": {
        const isKilled = params.isKilled !== false;
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.killLink(drone_id, isKilled);
        return NextResponse.json({ success: true, message: `Comms link ${isKilled ? "killed" : "restored"} for ${drone_id}` });
      }

      case "motor_temp": {
        const tempC = typeof params.tempC === "number" ? params.tempC : 86.5;
        const motorIndex = typeof params.motorIndex === "number" ? params.motorIndex : 1;
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.injectMotorTemp(drone_id, motorIndex, tempC);
        return NextResponse.json({ success: true, message: `Injected motor ${motorIndex + 1} temp ${tempC}C on ${drone_id}` });
      }

      case "reset": {
        if (!drone_id) return NextResponse.json({ error: "Missing 'drone_id'" }, { status: 400 });
        simulator.resetFaults(drone_id);
        return NextResponse.json({ success: true, message: `Reset all injected faults for ${drone_id}` });
      }

      case "reset_all": {
        simulator.resetAllFaults();
        return NextResponse.json({ success: true, message: "Reset all injected faults across fleet" });
      }

      default:
        return NextResponse.json({ error: `Unknown fault action '${action}'` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: "Failed to parse fault injection request", details: String(err) }, { status: 500 });
  }
}
