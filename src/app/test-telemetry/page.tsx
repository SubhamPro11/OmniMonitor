"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Activity,
  Radio,
  Zap,
  AlertTriangle,
  RotateCcw,
  WifiOff,
  Flame,
  ShieldCheck,
  Compass,
  TrendingDown,
  Bug,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { TelemetryEvent } from "@/types/database";
import { IngestionMetrics } from "@/types/telemetry";

interface SimulatorFaults {
  [drone_id: string]: {
    battery_override?: number;
    drift_offset?: { x: number; y: number; z: number };
    packet_loss_override?: number;
    link_killed?: boolean;
    motor_temp_spike?: { motor_index: number; temp_c: number };
  };
}

export default function TestTelemetryPage() {
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [metrics, setMetrics] = useState<IngestionMetrics & { malformedLogs?: Array<{ timestamp: string; reason: string; payloadSnippet: string }>; activeDrones?: number }>({
    total_received: 0,
    events_per_second: 0,
    dropped_or_malformed: 0,
    last_event_ts: null,
    activeDrones: 0,
    malformedLogs: [],
  });
  const [activeFaults, setActiveFaults] = useState<SimulatorFaults>({});
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "offline">("connecting");
  const [selectedDrone, setSelectedDrone] = useState<string>("DRONE-02");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showErrorDrawer, setShowErrorDrawer] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE Telemetry Stream
  useEffect(() => {
    let sse: EventSource;

    function connectSSE() {
      setConnectionStatus("connecting");
      sse = new EventSource("/api/telemetry/stream");
      eventSourceRef.current = sse;

      sse.onopen = () => {
        setConnectionStatus("connected");
      };

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "INITIAL_STATE") {
            setTelemetry(data.telemetry || []);
            if (data.metrics) setMetrics(data.metrics);
            if (data.activeFaults) setActiveFaults(data.activeFaults);
          } else if (data.type === "TELEMETRY_UPDATE") {
            if (data.batch) {
              setTelemetry((prev) => {
                const map = new Map(prev.map((d) => [d.drone_id, d]));
                for (const item of data.batch as TelemetryEvent[]) {
                  map.set(item.drone_id, item);
                }
                return Array.from(map.values()).sort((a, b) => a.drone_id.localeCompare(b.drone_id));
              });
            }
            if (data.metrics) setMetrics(data.metrics);
            if (data.activeFaults) setActiveFaults(data.activeFaults);
          }
        } catch (err) {
          console.error("Failed to parse SSE telemetry packet:", err);
        }
      };

      sse.onerror = () => {
        setConnectionStatus("offline");
        sse.close();
        // Fallback polling retry after 2 seconds
        setTimeout(connectSSE, 2000);
      };
    }

    connectSSE();

    return () => {
      if (sse) sse.close();
    };
  }, []);

  // Fault Injection Handler
  async function triggerFault(action: string, params: Record<string, unknown> = {}) {
    try {
      const res = await fetch("/api/simulator/fault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          drone_id: selectedDrone,
          ...params,
        }),
      });
      const json = await res.json();
      if (json.message) {
        setActionFeedback(json.message);
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err) {
      setActionFeedback(`Fault trigger error: ${String(err)}`);
    }
  }

  // Malformed Payload Test (Testing error detection)
  async function testMalformedPayload() {
    try {
      const res = await fetch("/api/simulator/malformed-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corrupted_drone: "DRONE-INVALID",
          ts: "invalid-timestamp",
          // missing mandatory position, battery, imu
        }),
      });
      const json = await res.json();
      setActionFeedback(json.message);
      setShowErrorDrawer(true);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      setActionFeedback(`Test error: ${String(err)}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#060911] text-slate-100 p-4 md:p-8 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* Header Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1e2c4a] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-slate-400 hover:text-amber-400 border border-slate-700 bg-slate-900 px-2 py-1 rounded transition-colors"
            >
              ← Overview
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
              Internal Telemetry Ingestion Verification
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/50">
                SECTION 2
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Validating 5Hz live telemetry ingestion, ring buffer storage, and fault injection controls before dashboard & adapter builds.
          </p>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#0a0f1d] border border-[#1e2c4a] px-3 py-1.5 rounded">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                  : connectionStatus === "connecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-rose-500"
              }`}
            />
            <span className="text-slate-400">STREAM:</span>
            <span
              className={`font-semibold ${
                connectionStatus === "connected"
                  ? "text-emerald-400"
                  : connectionStatus === "connecting"
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {connectionStatus === "connected"
                ? "LIVE SSE (5Hz)"
                : connectionStatus === "connecting"
                ? "CONNECTING..."
                : "RECONNECTING"}
            </span>
          </div>

          <div className="bg-[#0a0f1d] border border-[#1e2c4a] px-3 py-1.5 rounded text-slate-300">
            <span className="text-slate-500">INGESTION:</span>{" "}
            <span className="text-amber-400 font-bold tabular-data">
              {metrics.events_per_second.toFixed(0)} Hz
            </span>
          </div>
        </div>
      </header>

      {/* Metrics & Ingestion Bar */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0a0f1d] border border-[#1e2c4a] p-3 rounded">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Active Reporting Drones</div>
          <div className="text-2xl font-bold text-slate-100 font-mono mt-0.5 flex items-baseline gap-2">
            <span>{telemetry.length}</span>
            <span className="text-xs text-slate-500 font-normal">/ 12 fleet target</span>
          </div>
        </div>

        <div className="bg-[#0a0f1d] border border-[#1e2c4a] p-3 rounded">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Total Events Ingested</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-0.5 tabular-data">
            {metrics.total_received.toLocaleString()}
          </div>
        </div>

        <div className="bg-[#0a0f1d] border border-[#1e2c4a] p-3 rounded">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Ingestion Stream Rate</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-0.5 tabular-data">
            {metrics.events_per_second} <span className="text-xs text-slate-400 font-normal">events/sec</span>
          </div>
        </div>

        <div
          onClick={() => setShowErrorDrawer(!showErrorDrawer)}
          className={`p-3 rounded border cursor-pointer transition-colors ${
            metrics.dropped_or_malformed > 0
              ? "bg-rose-950/20 border-rose-800/60 hover:bg-rose-950/30"
              : "bg-[#0a0f1d] border-[#1e2c4a] hover:border-slate-600"
          }`}
        >
          <div className="text-[11px] font-mono text-slate-400 uppercase flex items-center justify-between">
            <span>Dropped / Malformed</span>
            {showErrorDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
          <div className="text-2xl font-bold font-mono mt-0.5 flex items-baseline gap-2">
            <span className={metrics.dropped_or_malformed > 0 ? "text-rose-400" : "text-slate-400"}>
              {metrics.dropped_or_malformed}
            </span>
            <span className="text-[10px] text-slate-500 font-normal">(Click to inspect)</span>
          </div>
        </div>
      </section>

      {/* Dropped / Malformed Error Drawer */}
      {showErrorDrawer && (
        <section className="bg-[#0a0f1d] border border-rose-800/50 rounded-lg p-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-rose-900/50 pb-2 mb-3">
            <span className="text-rose-300 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Safety Error Log: Dropped & Malformed Ingestion Events
            </span>
            <span className="text-slate-500 text-[11px]">Rule 6: Never Silently Swallow Errors</span>
          </div>

          {metrics.malformedLogs && metrics.malformedLogs.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {metrics.malformedLogs.map((log, i) => (
                <div key={i} className="bg-[#060911] border border-rose-900/30 p-2 rounded">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="text-rose-400 font-semibold">REJECTED: {log.reason}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <code className="text-[10px] text-slate-500 block truncate">{log.payloadSnippet}</code>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-center py-3">
              No malformed telemetry events rejected yet. Ingestion pipeline is clean.
            </div>
          )}
        </section>
      )}

      {/* Fault Injection Control Bar */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono text-slate-400 uppercase font-semibold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Fault Injection Test Controls:
            </span>

            {/* Drone Selector */}
            <select
              value={selectedDrone}
              onChange={(e) => setSelectedDrone(e.target.value)}
              className="bg-[#060911] border border-[#1e2c4a] text-slate-200 text-xs font-mono px-3 py-1.5 rounded focus:outline-none focus:border-amber-400"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const id = `DRONE-${String(i + 1).padStart(2, "0")}`;
                const isFaulted = activeFaults[id] ? " (Fault Active)" : "";
                return (
                  <option key={id} value={id}>
                    {id}
                    {isFaulted}
                  </option>
                );
              })}
            </select>

            {/* Action Buttons */}
            <button
              onClick={() => triggerFault("battery", { pct: 14.0 })}
              className="px-2.5 py-1.5 bg-amber-950/40 border border-amber-700/60 hover:bg-amber-900/60 text-amber-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Drop Battery (14%)
            </button>

            <button
              onClick={() => triggerFault("drift", { dx: 3.5, dy: 2.1, dz: 1.2 })}
              className="px-2.5 py-1.5 bg-orange-950/40 border border-orange-700/60 hover:bg-orange-900/60 text-orange-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Position Drift (+3.5m)
            </button>

            <button
              onClick={() => triggerFault("packet_loss", { pct: 55.0 })}
              className="px-2.5 py-1.5 bg-yellow-950/40 border border-yellow-700/60 hover:bg-yellow-900/60 text-yellow-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <Radio className="w-3.5 h-3.5" />
              Spike Loss (55%)
            </button>

            <button
              onClick={() => triggerFault("kill_link", { isKilled: true })}
              className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Kill Link
            </button>

            <button
              onClick={() => triggerFault("motor_temp", { motorIndex: 1, tempC: 86.5 })}
              className="px-2.5 py-1.5 bg-red-950/40 border border-red-700/60 hover:bg-red-900/60 text-red-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              Motor Temp (86.5°C)
            </button>

            <button
              onClick={() => triggerFault("reset")}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset {selectedDrone}
            </button>

            <button
              onClick={() => triggerFault("reset_all")}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Reset Fleet
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={testMalformedPayload}
              className="px-2.5 py-1.5 bg-rose-950/60 border border-rose-600 hover:bg-rose-900 text-rose-200 text-xs font-mono rounded flex items-center gap-1.5 transition-colors"
            >
              <Bug className="w-3.5 h-3.5 text-rose-400" />
              Inject Malformed Payload
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className="mt-3 p-2 bg-amber-950/30 border border-amber-700/50 rounded text-xs font-mono text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </section>

      {/* Live Telemetry Data Table */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
          <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider">
            Live Telemetry Ingestion Table (5Hz Refresh)
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {telemetry.length} Drones Active in Memory Buffer
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e2c4a] bg-[#060911] text-slate-400 text-[11px] uppercase">
                <th className="py-2.5 px-3">Drone ID</th>
                <th className="py-2.5 px-3">Local Pos (X, Y, Z)</th>
                <th className="py-2.5 px-3">Global Altitude</th>
                <th className="py-2.5 px-3">Velocity (m/s)</th>
                <th className="py-2.5 px-3">Battery (Pct / Volts)</th>
                <th className="py-2.5 px-3">IMU (Pitch / Roll / Yaw)</th>
                <th className="py-2.5 px-3">Link (RSSI / Loss)</th>
                <th className="py-2.5 px-3">Motor Temps (°C)</th>
                <th className="py-2.5 px-3">GPS / Mode</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#152037]">
              {telemetry.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    no data yet — connecting to telemetry pipeline...
                  </td>
                </tr>
              ) : (
                telemetry.map((d) => {
                  const fault = activeFaults[d.drone_id];
                  const isBatLow = d.battery.pct < 20;
                  const isLossHigh = d.link_quality.packet_loss_pct > 10;
                  const isHot = d.motor_temp.some((t) => t > 75);

                  return (
                    <tr
                      key={d.drone_id}
                      className={`hover:bg-[#0d1424] transition-colors tabular-data ${
                        isHot ? "bg-red-950/20" : fault ? "bg-amber-950/10" : ""
                      }`}
                    >
                      {/* Drone ID & Status */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{d.drone_id}</span>
                          {isHot && (
                            <span className="text-[10px] bg-red-950 border border-red-800 text-red-300 px-1 rounded">
                              THERMAL SPIKE
                            </span>
                          )}
                          {fault?.link_killed && (
                            <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-1 rounded">
                              LINK CUT
                            </span>
                          )}
                          {fault?.drift_offset && (
                            <span className="text-[10px] bg-orange-950 border border-orange-800 text-orange-300 px-1 rounded">
                              DRIFT
                            </span>
                          )}
                          {fault?.battery_override !== undefined && (
                            <span className="text-[10px] bg-amber-950 border border-amber-800 text-amber-300 px-1 rounded">
                              BAT LOW
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Local XYZ */}
                      <td className="py-2 px-3 text-slate-300">
                        [{d.position.x?.toFixed(1)}, {d.position.y?.toFixed(1)}, {d.position.z?.toFixed(1)}] m
                      </td>

                      {/* Altitude */}
                      <td className="py-2 px-3 text-slate-200 font-semibold">
                        {d.position.alt_m.toFixed(2)} m
                      </td>

                      {/* Velocity */}
                      <td className="py-2 px-3 text-slate-400">
                        vx:{d.velocity.x.toFixed(1)} vy:{d.velocity.y.toFixed(1)} vz:{d.velocity.z.toFixed(1)}
                      </td>

                      {/* Battery */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-slate-800 h-2 rounded overflow-hidden">
                            <div
                              className={`h-full ${
                                isBatLow ? "bg-rose-500" : d.battery.pct < 40 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, d.battery.pct))}%` }}
                            />
                          </div>
                          <span className={`font-semibold ${isBatLow ? "text-rose-400" : "text-slate-200"}`}>
                            {d.battery.pct.toFixed(0)}%
                          </span>
                          <span className="text-slate-500 text-[10px]">({d.battery.voltage}V)</span>
                        </div>
                      </td>

                      {/* IMU */}
                      <td className="py-2 px-3 text-slate-400">
                        {d.imu.pitch.toFixed(1)}° / {d.imu.roll.toFixed(1)}° / {d.imu.yaw.toFixed(0)}°
                      </td>

                      {/* Link Quality */}
                      <td className="py-2 px-3">
                        <span className="text-slate-300">{d.link_quality.rssi_dbm} dBm</span>{" "}
                        <span
                          className={`text-[11px] ${
                            isLossHigh ? "text-rose-400 font-bold" : "text-slate-500"
                          }`}
                        >
                          ({d.link_quality.packet_loss_pct.toFixed(0)}% loss)
                        </span>
                      </td>

                      {/* Motor Temps */}
                      <td className="py-2 px-3">
                        <div className="flex gap-1 text-[11px]">
                          {d.motor_temp.map((t, idx) => (
                            <span
                              key={idx}
                              className={`px-1 rounded ${
                                t > 80
                                  ? "bg-rose-950 text-rose-300 border border-rose-800"
                                  : t > 60
                                  ? "bg-amber-950 text-amber-300"
                                  : "text-slate-400"
                              }`}
                            >
                              {t.toFixed(0)}°
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* GPS & Mode */}
                      <td className="py-2 px-3">
                        <span className="text-emerald-400 font-semibold">{d.gps_fix}</span>{" "}
                        <span className="text-slate-500 text-[10px]">[{d.flight_mode}]</span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-2 px-3 text-slate-500 text-[11px]">
                        {new Date(d.ts).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer Instructions */}
      <footer className="border-t border-[#1e2c4a] pt-4 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>OMNIMONITOR FLEET SIMULATOR & INGESTION VERIFICATION (SECTION 2)</div>
        <div>CLI RUNNER AVAILABLE: <code className="text-amber-400">npm run sim</code></div>
      </footer>
    </main>
  );
}
