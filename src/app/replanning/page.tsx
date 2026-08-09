"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  AlertTriangle,
  Flame,
  WifiOff,
  Compass,
  TrendingDown,
  RotateCcw,
  CheckCircle2,
  Navigation,
  MapPin,
  Clock,
  Layers,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { FaultEvent } from "@/types/database";
import { SuggestedFix } from "@/types/replanning";

export default function ReplanningPage() {
  const [activeFaults, setActiveFaults] = useState<FaultEvent[]>([]);
  const [selectedDrone, setSelectedDrone] = useState<string>("DRONE-02");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Poll active faults and fixes at 4Hz
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function fetchAnomalies() {
      try {
        const res = await fetch("/api/anomalies/events");
        if (res.ok) {
          const data = await res.json();
          setActiveFaults(data.activeFaults || []);
        }
      } catch (err) {
        console.error("Failed to fetch anomalies & replans:", err);
      } finally {
        timer = setTimeout(fetchAnomalies, 250);
      }
    }

    fetchAnomalies();

    return () => clearTimeout(timer);
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
      setActionFeedback(`Fault error: ${String(err)}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#1e1e1e] text-[#f0f6fc] p-4 md:p-8 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* Header Navigation */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#333333] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-[#94a3b8] hover:text-[#4ade80] border border-[#1e2d4a] bg-[#10192e] px-2 py-1 rounded transition-colors"
            >
              ← Overview
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-[#f1f5f9] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#22c55e]" />
              4D Collision-Checked Re-Planning Engine
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#22c55e]/10 text-[#4ade80] border border-[#22c55e]/30">
                SECTION 6
              </span>
            </h1>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Dynamic 4D spatial corridor validation generating collision-free auto_correct, reroute_to_land, and hold_or_rth fixes.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <Link
            href="/anomalies"
            className="px-3 py-1.5 bg-[#10192e] hover:bg-[#17233f] text-[#f1f5f9] rounded border border-[#1e2d4a] transition-colors flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#4ade80]" />
            Anomalies Stream →
          </Link>
          <Link
            href="/monitoring"
            className="px-3 py-1.5 bg-[#10192e] hover:bg-[#17233f] text-[#f1f5f9] rounded border border-[#1e2d4a] transition-colors flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-[#4ade80]" />
            Health Engine →
          </Link>
        </div>
      </header>

      {/* Interactive Fault Injection Bar */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-4 font-mono text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400 uppercase font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Test Re-Planning Engine:
            </span>

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

            <button
              onClick={() => triggerFault("drift", { dx: 1.8, dy: 1.2, dz: 0.2 })}
              className="px-2.5 py-1.5 bg-emerald-950/40 border border-emerald-700/60 hover:bg-emerald-900/60 text-emerald-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Minor Drift (Auto-Correct Fix)
            </button>

            <button
              onClick={() => triggerFault("battery", { pct: 8.0 })}
              className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Battery 8% (Reroute to Land Fix)
            </button>

            <button
              onClick={() => triggerFault("motor_temp", { motorIndex: 1, tempC: 88.5 })}
              className="px-2.5 py-1.5 bg-red-950/40 border border-red-700/60 hover:bg-red-900/60 text-red-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              Motor 88°C (Emergency Descent)
            </button>

            <button
              onClick={() => triggerFault("kill_link", { isKilled: true })}
              className="px-2.5 py-1.5 bg-yellow-950/40 border border-yellow-700/60 hover:bg-yellow-900/60 text-yellow-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Comms Loss (Ceiling Hold / RTH)
            </button>

            <button
              onClick={() => triggerFault("reset")}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset {selectedDrone}
            </button>
          </div>
        </div>

        {actionFeedback && (
          <div className="mt-3 p-2 bg-amber-950/30 border border-amber-700/50 rounded text-xs text-amber-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </section>

      {/* Suggested Fixes Feed */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col font-mono text-xs">
        <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
          <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Collision-Checked Suggested Fixes (Status: Pending Controller Approval)
          </span>
          <span className="text-[11px] text-slate-400">
            Safety Margin: ≥ 2.0m Swarm Clearance
          </span>
        </div>

        {activeFaults.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <ShieldCheck className="w-12 h-12 text-emerald-500/40 mx-auto mb-3" />
            <div className="font-semibold text-slate-300 text-sm">no pending re-plans — all flight paths clear</div>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              The re-planning engine is actively monitoring swarm corridors. Inject a fault above to generate collision-checked trajectories.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#152037]">
            {activeFaults.map((evt) => {
              const isCritical = evt.severity === "critical";
              const fix = evt.suggested_fix as unknown as SuggestedFix | null;

              return (
                <div key={evt.id} className="p-5 space-y-3">
                  {/* Top Bar: Drone ID + Fix Type Badge + Collision Check Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-base text-slate-100">{evt.drone_id}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          isCritical
                            ? "bg-rose-950 border border-rose-800 text-rose-300"
                            : "bg-amber-950 border border-amber-800 text-amber-300"
                        }`}
                      >
                        {evt.severity} {evt.fault_type.replace("_", " ")}
                      </span>

                      {fix && (
                        <span className="px-2.5 py-0.5 rounded font-bold text-[11px] bg-emerald-950 border border-emerald-800 text-emerald-300 flex items-center gap-1.5">
                          <Navigation className="w-3 h-3 text-emerald-400" />
                          FIX: {fix.fix_type.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      {fix?.collision_checked && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          COLLISION-CHECKED (Margin: {fix.safety_margin_m.toFixed(1)}m)
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        STATUS: {evt.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Fix Details Card */}
                  {fix ? (
                    <div className="bg-[#060911] border border-[#1e2c4a] rounded-lg p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-300 text-xs border-b border-[#1e2c4a]/60 pb-2">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            Duration: <strong className="text-slate-200">{fix.estimated_duration_s}s</strong>
                          </span>
                          {fix.landing_zone_id && (
                            <span className="flex items-center gap-1.5 text-slate-400">
                              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                              Target Zone: <strong className="text-slate-200">{fix.landing_zone_id}</strong>
                            </span>
                          )}
                          {fix.min_separation_m !== undefined && (
                            <span className="text-slate-400">
                              Observed Clearance: <strong className="text-emerald-400">{fix.min_separation_m.toFixed(2)}m</strong>
                            </span>
                          )}
                        </div>

                        {fix.detour_applied && (
                          <span className="text-[11px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                            PERIMETER DETOUR APPLIED (Avoided Swarm Conflict)
                          </span>
                        )}
                      </div>

                      {/* 3D Waypoint Path Sequence */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Generated Trajectory Waypoints:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                          {fix.waypoints.map((wp, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-900/80 border border-slate-800 p-2 rounded text-[11px] flex flex-col"
                            >
                              <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
                                <span>STEP {idx + 1}</span>
                                <span>{(wp.t_offset_ms / 1000).toFixed(1)}s</span>
                              </div>
                              <div className="text-slate-200 font-bold">
                                [{wp.x.toFixed(1)}, {wp.y.toFixed(1)}, {wp.z.toFixed(1)}]m
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {fix.notes && (
                        <div className="text-[11px] text-slate-400 italic pt-1">
                          Note: {fix.notes}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 text-slate-500 italic bg-[#060911] border border-[#1e2c4a] rounded">
                      generating collision-checked trajectory...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e2c4a] pt-4 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>OMNIMONITOR RE-PLANNING ENGINE (SECTION 6)</div>
        <div>STRICT CONTROLLER APPROVAL GATE MAINTAINED (NO UNAPPROVED EXECUTION)</div>
      </footer>
    </main>
  );
}
