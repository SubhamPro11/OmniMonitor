import { DroneFleetSimulator } from "../src/lib/simulator/engine";
import { IngestionReceiver } from "../src/lib/ingestion/receiver";
import { WebSocketServer, WebSocket } from "ws";

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(key: string, defaultValue?: string): string | undefined {
  const match = args.find((a) => a.startsWith(`--${key}=`));
  if (match) return match.split("=")[1];
  const flagIndex = args.indexOf(`--${key}`);
  if (flagIndex !== -1 && args[flagIndex + 1]) return args[flagIndex + 1];
  return defaultValue;
}

const droneCount = parseInt(getArg("drones", "12") || "12", 10);
const frequencyHz = parseFloat(getArg("hz", "5") || "5");
const wsPortStr = getArg("ws-port", "8080");
const wsPort = wsPortStr ? parseInt(wsPortStr, 10) : 8080;

console.log("================================================================================");
console.log("             OMNIMONITOR — FLEET SIMULATOR & TELEMETRY INGESTION (CLI)          ");
console.log("================================================================================");
console.log(`[INIT] Drones: ${droneCount} | Rate: ${frequencyHz} Hz per drone | WS Port: ${wsPort}`);
console.log("--------------------------------------------------------------------------------");

const simulator = new DroneFleetSimulator({
  drone_count: droneCount,
  frequency_hz: frequencyHz,
});

const receiver = new IngestionReceiver();

// Wire simulator to ingestion receiver
simulator.onBatch((batch) => {
  receiver.ingestBatch(batch);
});

// Optional WebSocket server to broadcast telemetry to external consumers
let wss: WebSocketServer | null = null;
try {
  wss = new WebSocketServer({ port: wsPort });
  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS] Client connected to live telemetry stream");
    ws.send(
      JSON.stringify({
        type: "INITIAL_STATE",
        telemetry: receiver.getLatestSnapshot(),
        metrics: receiver.getMetrics(),
      })
    );
  });

  simulator.onBatch((batch) => {
    if (!wss) return;
    const payload = JSON.stringify({
      type: "TELEMETRY_UPDATE",
      batch,
      metrics: receiver.getMetrics(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  console.log(`[WS BROADCAST] WebSocket stream broadcasting on ws://localhost:${wsPort}`);
} catch (err) {
  console.warn(`[WS NOTICE] Standalone WS server on port ${wsPort} skipped (${err})`);
}

// Parse initial CLI faults if provided
const faultDrone = getArg("fault-drone");
const faultType = getArg("fault");

if (faultDrone && faultType) {
  if (faultType === "battery") {
    const val = parseFloat(getArg("val", "12") || "12");
    simulator.injectBattery(faultDrone, val);
    console.log(`[FAULT INJECTED] Drone ${faultDrone} battery set to ${val}%`);
  } else if (faultType === "drift") {
    const dx = parseFloat(getArg("dx", "3.0") || "3.0");
    const dy = parseFloat(getArg("dy", "2.0") || "2.0");
    const dz = parseFloat(getArg("dz", "1.0") || "1.0");
    simulator.injectPositionDrift(faultDrone, dx, dy, dz);
    console.log(`[FAULT INJECTED] Drone ${faultDrone} drift set to [${dx}m, ${dy}m, ${dz}m]`);
  } else if (faultType === "packet_loss") {
    const val = parseFloat(getArg("val", "50") || "50");
    simulator.injectPacketLoss(faultDrone, val);
    console.log(`[FAULT INJECTED] Drone ${faultDrone} packet loss set to ${val}%`);
  } else if (faultType === "kill_link") {
    simulator.killLink(faultDrone, true);
    console.log(`[FAULT INJECTED] Drone ${faultDrone} comms link KILLED`);
  }
}

// Start simulation
simulator.start();
console.log("[STATUS] Fleet simulation ACTIVE and ingesting.\n");
console.log("Key shortcuts in this CLI:");
console.log("  [b] Inject Battery Drop (14%) on DRONE-02");
console.log("  [d] Inject Position Drift (+3.5m) on DRONE-05");
console.log("  [p] Inject Packet Loss (60%) on DRONE-08");
console.log("  [k] Toggle Kill Comms Link on DRONE-11");
console.log("  [m] Inject Malformed Telemetry (Test Error Logging)");
console.log("  [r] Reset All Injected Faults");
console.log("  [q] Quit\n");

// Periodic Terminal Telemetry Feed (every 2 seconds)
let killLinkState = false;
setInterval(() => {
  const metrics = receiver.getMetrics();
  const snapshot = receiver.getLatestSnapshot();
  const faults = simulator.getActiveFaults();

  console.clear();
  console.log("================================================================================");
  console.log("                     OMNIMONITOR — LIVE TELEMETRY DASHBOARD                     ");
  console.log("================================================================================");
  console.log(
    ` RATE: ${metrics.events_per_second.toString().padStart(3)} Hz | ` +
      `TOTAL RECEIVED: ${metrics.total_received.toString().padStart(6)} | ` +
      `ACTIVE DRONES: ${metrics.activeDrones}/${droneCount} | ` +
      `DROPPED/MALFORMED: ${metrics.dropped_or_malformed}`
  );
  console.log("--------------------------------------------------------------------------------");
  console.log(" DRONE ID  | POS (X, Y, Z)     | ALT (m) | BATTERY  | RSSI / LOSS | MOTOR TEMPS (C) | FIX");
  console.log("-----------+-------------------+---------+----------+-------------+-----------------+-----");

  for (const d of snapshot.slice(0, 12)) {
    const x = d.position.x?.toFixed(1).padStart(5) || "  0.0";
    const y = d.position.y?.toFixed(1).padStart(5) || "  0.0";
    const z = d.position.z?.toFixed(1).padStart(5) || "  0.0";
    const alt = d.position.alt_m.toFixed(1).padStart(7);
    const batPct = `${d.battery.pct.toFixed(0)}%`.padStart(4);
    const batVolts = `${d.battery.voltage.toFixed(1)}V`;
    const rssi = `${d.link_quality.rssi_dbm}dBm`.padStart(7);
    const loss = `${d.link_quality.packet_loss_pct.toFixed(0)}%`.padStart(3);
    const mTemps = d.motor_temp.map((t) => t.toFixed(0)).join(" ");
    const fix = d.gps_fix;

    const hasFault = faults[d.drone_id] ? "⚠️" : " ";

    console.log(
      ` ${d.drone_id} ${hasFault} | ${x}, ${y}, ${z} | ${alt} | ${batPct} ${batVolts} | ${rssi} ${loss} | ${mTemps.padEnd(15)} | ${fix}`
    );
  }

  if (metrics.malformedLogs.length > 0) {
    console.log("--------------------------------------------------------------------------------");
    console.log(`[RECENT INGESTION WARNINGS (${metrics.malformedLogs.length} total)]`);
    for (const log of metrics.malformedLogs.slice(0, 2)) {
      console.log(` > [${log.timestamp.slice(11, 19)}] Reason: ${log.reason}`);
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log("Press [b]=BatDrop, [d]=Drift, [p]=PktLoss, [k]=KillLink, [m]=Malformed, [r]=Reset, [q]=Quit");
}, 1000);

// Interactive terminal input
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (key: string) => {
    if (key === "q" || key === "\u0003") {
      console.log("\n[SHUTDOWN] Exiting simulator...");
      simulator.stop();
      if (wss) wss.close();
      process.exit(0);
    } else if (key === "b") {
      simulator.injectBattery("DRONE-02", 14.0);
    } else if (key === "d") {
      simulator.injectPositionDrift("DRONE-05", 3.8, 2.4, 1.2);
    } else if (key === "p") {
      simulator.injectPacketLoss("DRONE-08", 65.0);
    } else if (key === "k") {
      killLinkState = !killLinkState;
      simulator.killLink("DRONE-11", killLinkState);
    } else if (key === "m") {
      // Ingest deliberately malformed payload
      receiver.ingest({
        drone_id: "DRONE-99",
        ts: new Date().toISOString(),
        position: { invalid_coordinate: true },
      });
    } else if (key === "r") {
      killLinkState = false;
      simulator.resetAllFaults();
    }
  });
}
