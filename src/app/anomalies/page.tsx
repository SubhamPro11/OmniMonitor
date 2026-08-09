"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  WifiOff,
  Compass,
  TrendingDown,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  Activity,
} from "lucide-react";
import { FaultEvent } from "@/types/database";
import { AnomalyThresholdsConfig } from "@/lib/anomalies/config";

export default function AnomaliesPage() {
  const [activeFaults, setActiveFaults] = useState<FaultEvent[]>([]);
  const [history, setHistory] = useState<FaultEvent[]>([]);
  const [config, setConfig] = useState<AnomalyThresholdsConfig | null>(null);
  const [selectedDrone, setSelectedDrone] = useState<string>("DRONE-02");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  // Poll Anomalies at 4Hz (every 250ms) for instant sub-second response
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function fetchAnomalies() {
      try {
        const res = await fetch("/api/anomalies/events");
        if (res.ok) {
          const data = await res.json();
          setActiveFaults(data.activeFaults || []);
          setHistory(data.history || []);
          if (!config && data.config) {
            setConfig(data.config);
          }
        }
      } catch (err) {
        console.error("Failed to fetch anomalies:", err);
      } finally {
        timer = setTimeout(fetchAnomalies, 250);
      }
    }

    fetchAnomalies();

    return () => clearTimeout(timer);
  }, [config]);

  // Update Config
  async function updateThreshold(key: keyof AnomalyThresholdsConfig, val: number) {
    if (!config) return;
    const updated = { ...config, [key]: val };
    setConfig(updated);

    try {
      await fetch("/api/anomalies/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setActionFeedback(`Updated threshold ${key} to ${val}`);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      console.error("Failed to update config:", err);
    }
  }

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
    <main className="min-h-screen bg-[#060911] text-slate-100 p-4 md:p-8 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* Header Navigation */}
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
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Rule-Based Anomaly Detection & Fault Stream
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/50">
                SECTION 5
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tunable, debounced threshold monitoring classifying health drops into pending fault events (2 consecutive readings debounce).
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-1.5 bg-[#0a0f1d] hover:bg-slate-800 text-slate-200 rounded border border-[#1e2c4a] transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            Tune Thresholds ({showConfigDrawer ? "Hide" : "Edit"})
          </button>
          <Link
            href="/monitoring"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Live Health Scores →
          </Link>
        </div>
      </header>

      {/* Thresholds Tuner Drawer */}
      {showConfigDrawer && config && (
        <section className="bg-[#0a0f1d] border border-amber-900/60 rounded-lg p-5 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-amber-900/40 pb-2">
            <h2 className="text-xs font-bold text-amber-300 uppercase flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Independent Anomaly Thresholds (Section 5 Spec)
            </h2>
            <span className="text-slate-500 text-[11px]">Debounce: {config.debounce_consecutive_readings} Consecutive Readings</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Battery Rules */}
            <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded space-y-2">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
                Battery Thresholds (%)
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Warning (&lt;):</span>
                <input
                  type="number"
                  value={config.battery_warning_pct}
                  onChange={(e) => updateThreshold("battery_warning_pct", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Critical (&lt;):</span>
                <input
                  type="number"
                  value={config.battery_critical_pct}
                  onChange={(e) => updateThreshold("battery_critical_pct", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
            </div>

            {/* Position Drift Rules */}
            <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded space-y-2">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-orange-400" />
                Position Drift Thresholds (Meters)
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Warning (&gt;):</span>
                <input
                  type="number"
                  step="0.1"
                  value={config.position_drift_warning_m}
                  onChange={(e) => updateThreshold("position_drift_warning_m", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Critical (&gt;):</span>
                <input
                  type="number"
                  step="0.1"
                  value={config.position_drift_critical_m}
                  onChange={(e) => updateThreshold("position_drift_critical_m", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
            </div>

            {/* RF Comms & Motor Temperature Rules */}
            <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded space-y-2">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-red-400" />
                Comms Loss & Motor Heat
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Packet Loss Warning (&gt;%):</span>
                <input
                  type="number"
                  value={config.packet_loss_warning_pct}
                  onChange={(e) => updateThreshold("packet_loss_warning_pct", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Motor Temp Critical (&gt;°C):</span>
                <input
                  type="number"
                  value={config.motor_temp_critical_c}
                  onChange={(e) => updateThreshold("motor_temp_critical_c", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Total Link Cut Critical (s):</span>
                <input
                  type="number"
                  step="0.5"
                  value={config.link_loss_critical_seconds}
                  onChange={(e) => updateThreshold("link_loss_critical_seconds", parseFloat(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-right"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Fault Injection Control Bar */}
      <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-4 font-mono text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400 uppercase font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Inject Anomaly & Test Debounce:
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
              onClick={() => triggerFault("battery", { pct: 15.0 })}
              className="px-2.5 py-1.5 bg-amber-950/40 border border-amber-700/60 hover:bg-amber-900/60 text-amber-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Battery 15% (Warning)
            </button>

            <button
              onClick={() => triggerFault("battery", { pct: 8.0 })}
              className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Battery 8% (Critical)
            </button>

            <button
              onClick={() => triggerFault("drift", { dx: 2.2, dy: 1.5, dz: 0.5 })}
              className="px-2.5 py-1.5 bg-yellow-950/40 border border-yellow-700/60 hover:bg-yellow-900/60 text-yellow-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Drift 2.2m (Warning)
            </button>

            <button
              onClick={() => triggerFault("drift", { dx: 4.8, dy: 2.5, dz: 1.0 })}
              className="px-2.5 py-1.5 bg-orange-950/40 border border-orange-700/60 hover:bg-orange-900/60 text-orange-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Drift 4.8m (Critical)
            </button>

            <button
              onClick={() => triggerFault("kill_link", { isKilled: true })}
              className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Comms Cut &gt;3s (Critical)
            </button>

            <button
              onClick={() => triggerFault("motor_temp", { motorIndex: 2, tempC: 88.0 })}
              className="px-2.5 py-1.5 bg-red-950/40 border border-red-700/60 hover:bg-red-900/60 text-red-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              Motor 88°C (Critical)
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

      {/* Main Content Grid: Active Pending Faults & Audit History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        {/* Left 2 Cols: Active Classified Fault Events */}
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col">
            <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
              <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Active Classified Fault Events (Status: Pending)
              </span>
              <span className="text-[11px] text-slate-400">
                {activeFaults.length} Active Breach{activeFaults.length === 1 ? "" : "es"}
              </span>
            </div>

            {activeFaults.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
                <div className="font-semibold text-slate-300">no active anomalies — fleet safe</div>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  All 12 drones are operating within nominal thresholds. Inject a fault above to test classification and debouncing.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#152037]">
                {activeFaults.map((evt) => {
                  const isCritical = evt.severity === "critical";
                  const deltaObj = (typeof evt.delta === "object" && evt.delta !== null ? evt.delta : {}) as Record<string, unknown>;

                  return (
                    <div
                      key={evt.id}
                      className={`p-4 transition-colors ${
                        isCritical ? "bg-rose-950/20" : "bg-amber-950/15"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                              isCritical
                                ? "bg-rose-950 border border-rose-800 text-rose-300"
                                : "bg-amber-950 border border-amber-800 text-amber-300"
                            }`}
                          >
                            {evt.severity}
                          </span>
                          <span className="font-bold text-sm text-slate-100">{evt.drone_id}</span>
                          <span className="text-slate-400 text-xs uppercase font-semibold">
                            {evt.fault_type.replace("_", " ")}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Detected: {new Date(evt.detected_at).toLocaleTimeString()}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            STATUS: {evt.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Delta details */}
                      <div className="bg-[#060911] border border-[#1e2c4a] p-2.5 rounded text-[11px] text-slate-300 space-y-1">
                        <div className="text-slate-400">
                          {String(deltaObj.description || "Threshold breach detected across consecutive readings.")}
                        </div>
                        <div className="flex items-center gap-4 text-slate-500 text-[10px]">
                          <span>Observed Value: <strong className="text-slate-200">{String(deltaObj.observed_value ?? "—")} {String(deltaObj.unit ?? "")}</strong></span>
                          <span>Rule Threshold: <strong className="text-slate-200">{String(deltaObj.threshold ?? "—")} {String(deltaObj.unit ?? "")}</strong></span>
                          <span>Suggested Fix: <em className="text-slate-500">None (Gated to Section 6)</em></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right 1 Col: Chronological Event History Log */}
        <div className="space-y-4">
          <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col">
            <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
              <span className="font-semibold text-slate-300 uppercase tracking-wider">
                Classification Log Buffer
              </span>
              <span className="text-[11px] text-slate-500">{history.length} events logged</span>
            </div>

            {history.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                no data yet — classification log empty
              </div>
            ) : (
              <div className="divide-y divide-[#152037] max-h-[480px] overflow-y-auto">
                {history.map((evt) => (
                  <div key={evt.id} className="p-3 text-[11px] hover:bg-[#0d1424] transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-200">{evt.drone_id}</span>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold ${
                          evt.severity === "critical"
                            ? "bg-rose-950 text-rose-300"
                            : "bg-amber-950 text-amber-300"
                        }`}
                      >
                        {evt.severity}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px]">{evt.fault_type.replace("_", " ")}</div>
                    <div className="text-slate-500 text-[9px] mt-0.5">
                      {new Date(evt.detected_at).toLocaleTimeString()} • STATUS: {evt.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1e2c4a] pt-4 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>OMNIMONITOR RULE-BASED ANOMALY CLASSIFIER (SECTION 5)</div>
        <div>SUGGESTED_FIX FIELD STRICTLY NULL (GATED TO SECTION 6 RE-PLANNING ENGINE)</div>
      </footer>
    </main>
  );
}
