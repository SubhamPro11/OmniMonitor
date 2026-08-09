"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Zap,
  TrendingDown,
  Compass,
  Radio,
  WifiOff,
  Flame,
  RotateCcw,
  ShieldCheck,
  Play,
  Pause,
  AlertTriangle,
  FileCode,
} from "lucide-react";
import { DroneHealthBreakdown, FleetSyncSnapshot } from "@/types/health";

export default function MonitoringPage() {
  const [snapshot, setSnapshot] = useState<FleetSyncSnapshot | null>(null);
  const [selectedDrone, setSelectedDrone] = useState<string>("DRONE-02");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Poll Health Snapshot at 4Hz (every 250ms) for sub-second reactive rendering
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/sync/health");
        if (res.ok) {
          const data = (await res.json()) as FleetSyncSnapshot;
          setSnapshot(data);
          setIsPlaying(data.is_show_running);
        }
      } catch (err) {
        console.error("Failed to fetch health snapshot:", err);
      } finally {
        timer = setTimeout(fetchHealth, 250);
      }
    }

    fetchHealth();

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Control Show Clock
  async function toggleShowClock(action: "start" | "pause" | "reset") {
    try {
      const res = await fetch("/api/sync/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.is_running !== undefined) {
        setIsPlaying(data.is_running);
      }
    } catch (err) {
      console.error("Failed to toggle show clock:", err);
    }
  }

  // Trigger Fault Injections
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
      setActionFeedback(`Fault error: ${String(err)}`);
    }
  }

  const drones = snapshot?.drones || [];
  const showTimeSec = ((snapshot?.current_show_time_ms || 0) / 1000).toFixed(1);

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
              <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
              Sync & Live Health Monitoring Engine
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/50">
                SECTION 4
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time intended vs. actual trajectory comparison, spatial drift measurement, and weighted composite health scoring (0-100).
          </p>
        </div>

        {/* Action Links */}
        <div className="flex items-center gap-2">
          <Link
            href="/import-show"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            Show Importer
          </Link>
          <Link
            href="/test-telemetry"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-700 transition-colors"
          >
            Raw Telemetry Table →
          </Link>
        </div>
      </header>

      {/* Top Show Clock & Fleet Status Ribbon */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        {/* Show Timeline & Clock Control */}
        <div className="bg-[#0a0f1d] border border-[#1e2c4a] p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>SHOW TIMELINE</span>
            <span className="text-slate-300 font-semibold">{snapshot?.show_name || "Skybrush Vortex"}</span>
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1 tabular-data flex items-baseline gap-2">
            <span>{showTimeSec}s</span>
            <span className="text-xs text-slate-500 font-normal">
              / {((snapshot?.show_duration_ms || 60000) / 1000).toFixed(0)}s duration
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => toggleShowClock(isPlaying ? "pause" : "start")}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center gap-1 transition-colors"
            >
              {isPlaying ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => toggleShowClock("reset")}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs rounded border border-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Healthy Tier Badge */}
        <div className="bg-[#0a0f1d] border border-emerald-900/50 p-3.5 rounded">
          <div className="text-[11px] text-emerald-400 uppercase font-semibold">Tier 1: Healthy (Score ≥ 80)</div>
          <div className="text-3xl font-bold text-emerald-400 mt-1 tabular-data">
            {snapshot?.healthy_count ?? 0}
            <span className="text-xs text-slate-500 font-normal ml-2">/ {snapshot?.total_drones ?? 12} drones</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Normal trajectory & nominal systems</div>
        </div>

        {/* Warning Tier Badge */}
        <div className="bg-[#0a0f1d] border border-amber-900/50 p-3.5 rounded">
          <div className="text-[11px] text-amber-400 uppercase font-semibold">Tier 2: Warning (50 - 79)</div>
          <div className="text-3xl font-bold text-amber-400 mt-1 tabular-data">
            {snapshot?.warning_count ?? 0}
            <span className="text-xs text-slate-500 font-normal ml-2">requiring attention</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Minor drift (&gt;1.5m), packet loss, thermal rise</div>
        </div>

        {/* Critical Tier Badge */}
        <div className="bg-[#0a0f1d] border border-rose-900/50 p-3.5 rounded">
          <div className="text-[11px] text-rose-400 uppercase font-semibold">Tier 3: Critical (&lt; 50)</div>
          <div className="text-3xl font-bold text-rose-400 mt-1 tabular-data">
            {snapshot?.critical_count ?? 0}
            <span className="text-xs text-slate-500 font-normal ml-2">safety hazard</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Severe drift (&gt;4m), battery &lt;10%, comms loss</div>
        </div>
      </section>

      {/* Interactive Fault Injection Control Bar */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-4 font-mono">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400 uppercase font-semibold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Live Fault Injection Test:
            </span>

            {/* Drone Selector */}
            <select
              value={selectedDrone}
              onChange={(e) => setSelectedDrone(e.target.value)}
              className="bg-[#060911] border border-[#1e2c4a] text-slate-200 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const id = `DRONE-${String(i + 1).padStart(2, "0")}`;
                return (
                  <option key={id} value={id}>
                    {id}
                  </option>
                );
              })}
            </select>

            {/* Fault Buttons */}
            <button
              onClick={() => triggerFault("battery", { pct: 12.0 })}
              className="px-2.5 py-1.5 bg-amber-950/40 border border-amber-700/60 hover:bg-amber-900/60 text-amber-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Drop Battery (12%)
            </button>

            <button
              onClick={() => triggerFault("drift", { dx: 3.8, dy: 2.2, dz: 1.1 })}
              className="px-2.5 py-1.5 bg-orange-950/40 border border-orange-700/60 hover:bg-orange-900/60 text-orange-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Position Drift (+4.4m)
            </button>

            <button
              onClick={() => triggerFault("packet_loss", { pct: 60.0 })}
              className="px-2.5 py-1.5 bg-yellow-950/40 border border-yellow-700/60 hover:bg-yellow-900/60 text-yellow-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <Radio className="w-3.5 h-3.5" />
              Spike Loss (60%)
            </button>

            <button
              onClick={() => triggerFault("kill_link", { isKilled: true })}
              className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Kill Link
            </button>

            <button
              onClick={() => triggerFault("motor_temp", { motorIndex: 0, tempC: 89.0 })}
              className="px-2.5 py-1.5 bg-red-950/40 border border-red-700/60 hover:bg-red-900/60 text-red-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              Motor Temp (89°C)
            </button>

            <button
              onClick={() => triggerFault("reset")}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset {selectedDrone}
            </button>

            <button
              onClick={() => triggerFault("reset_all")}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Reset All
            </button>
          </div>
        </div>

        {/* Action Feedback */}
        {actionFeedback && (
          <div className="mt-3 p-2 bg-amber-950/30 border border-amber-700/50 rounded text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </section>

      {/* Live Health Breakdown Table */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col font-mono text-xs">
        <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
          <span className="font-semibold text-slate-300 uppercase tracking-wider">
            Fleet Real-Time Health & Spatial Sync Table
          </span>
          <span className="text-[11px] text-slate-500">
            Formula: 0.35×Pos + 0.25×Bat + 0.20×Link + 0.20×Thermal
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1e2c4a] bg-[#060911] text-slate-400 text-[11px] uppercase">
                <th className="py-2.5 px-3">Drone ID</th>
                <th className="py-2.5 px-3">Health Score</th>
                <th className="py-2.5 px-3">Tier</th>
                <th className="py-2.5 px-3">Position Delta (Δpos)</th>
                <th className="py-2.5 px-3">Battery</th>
                <th className="py-2.5 px-3">Link Quality</th>
                <th className="py-2.5 px-3">Motor Temp (Max)</th>
                <th className="py-2.5 px-3">Intended Position</th>
                <th className="py-2.5 px-3">Actual Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#152037]">
              {drones.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    no data yet — sync monitoring engine connecting...
                  </td>
                </tr>
              ) : (
                drones.map((d: DroneHealthBreakdown) => {
                  const score = d.composite_health_score;
                  const isCritical = d.tier === "critical";
                  const isWarning = d.tier === "warning";

                  return (
                    <tr
                      key={d.drone_id}
                      className={`hover:bg-[#0d1424] transition-colors tabular-data ${
                        isCritical ? "bg-rose-950/20" : isWarning ? "bg-amber-950/15" : ""
                      }`}
                    >
                      {/* Drone ID */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{d.drone_id}</span>
                          {d.is_stale && (
                            <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 px-1 rounded">
                              STALE ({d.last_received_ms_ago}ms)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Health Score with Visual Gauge */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-800 h-2 rounded overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isCritical ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                            />
                          </div>
                          <span
                            className={`font-bold text-sm ${
                              isCritical ? "text-rose-400" : isWarning ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            {score.toFixed(0)}
                          </span>
                        </div>
                      </td>

                      {/* Tier Badge */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                            isCritical
                              ? "bg-rose-950/80 border border-rose-800 text-rose-300"
                              : isWarning
                              ? "bg-amber-950/80 border border-amber-800 text-amber-300"
                              : "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
                          }`}
                        >
                          {d.tier}
                        </span>
                      </td>

                      {/* Position Delta */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`font-semibold ${
                              d.position_delta_m > 4.0
                                ? "text-rose-400"
                                : d.position_delta_m > 1.5
                                ? "text-amber-400"
                                : "text-slate-200"
                            }`}
                          >
                            {d.position_delta_m.toFixed(2)}m
                          </span>
                          <span className="text-slate-500 text-[10px]">({d.position_score.toFixed(0)} pts)</span>
                        </div>
                      </td>

                      {/* Battery */}
                      <td className="py-2.5 px-3">
                        <span
                          className={d.battery_pct < 15 ? "text-rose-400 font-bold" : d.battery_pct < 30 ? "text-amber-400" : "text-slate-200"}
                        >
                          {d.battery_pct.toFixed(0)}%
                        </span>{" "}
                        <span className="text-slate-500 text-[10px]">({d.battery_voltage.toFixed(1)}V)</span>
                      </td>

                      {/* Link Quality */}
                      <td className="py-2.5 px-3">
                        <span className="text-slate-300">{d.link_quality.toFixed(0)}%</span>{" "}
                        <span className="text-slate-500 text-[10px]">({d.rssi_dbm}dBm, {d.packet_loss_pct.toFixed(0)}% loss)</span>
                      </td>

                      {/* Motor Temp */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-semibold ${
                            d.motor_temp_max > 80 ? "text-rose-400 font-bold" : d.motor_temp_max > 60 ? "text-amber-400" : "text-slate-300"
                          }`}
                        >
                          {d.motor_temp_max.toFixed(1)}°C
                        </span>{" "}
                        <span className="text-slate-500 text-[10px]">({d.thermal_score.toFixed(0)} pts)</span>
                      </td>

                      {/* Intended Position */}
                      <td className="py-2.5 px-3 text-slate-400">
                        {d.intended_position ? (
                          <span>
                            [{d.intended_position.x?.toFixed(1)}, {d.intended_position.y?.toFixed(1)}, {d.intended_position.z?.toFixed(1)}]m
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Actual Position */}
                      <td className="py-2.5 px-3 text-slate-300 font-medium">
                        {d.actual_position ? (
                          <span>
                            [{d.actual_position.x?.toFixed(1)}, {d.actual_position.y?.toFixed(1)}, {d.actual_position.z?.toFixed(1)}]m
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e2c4a] pt-4 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>OMNIMONITOR SYNC & MONITORING ENGINE (SECTION 4)</div>
        <div>TEST HARNESS ACTIVE: VERIFYING &lt; 1-SECOND RESPONSE TO INJECTED FAULTS</div>
      </footer>
    </main>
  );
}
