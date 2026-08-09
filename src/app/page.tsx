"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Radio,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Download,
  Terminal,
  FileCode,
  Layers,
  ChevronRight,
  TrendingDown,
  Compass,
  WifiOff,
  Flame,
  X,
  Keyboard,
  Battery,
  Wifi,
  Navigation,
  Gauge,
} from "lucide-react";
import { FaultEvent } from "@/types/database";
import { FleetSyncSnapshot, DroneHealthBreakdown } from "@/types/health";
import { SuggestedFix } from "@/types/replanning";
import { AuditLogEntry } from "@/types/controller";
import { SpatialRadar } from "@/components/SpatialRadar";

export default function ControllerMissionControlPage() {
  const [snapshot, setSnapshot] = useState<FleetSyncSnapshot | null>(null);
  const [activeFaults, setActiveFaults] = useState<FaultEvent[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditLogEntry[]>([]);
  const [selectedFaultId, setSelectedFaultId] = useState<string | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState<string>("DRONE-02");
  const [detailDrone, setDetailDrone] = useState<DroneHealthBreakdown | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>("Manual visual obstruction");
  const [overrideNotes, setOverrideNotes] = useState<string>("Controller forced ground hold");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"faults" | "audit">("faults");

  // Asynchronous 4Hz Polling Loop (Zero Stacking, High-Performance)
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function loadData() {
      try {
        const [healthRes, faultsRes, auditRes] = await Promise.all([
          fetch("/api/sync/health"),
          fetch("/api/anomalies/events"),
          fetch("/api/controller/audit"),
        ]);

        if (healthRes.ok) {
          const hData = (await healthRes.json()) as FleetSyncSnapshot;
          setSnapshot(hData);
          if (selectedDroneId && hData.drones) {
            const d = hData.drones.find((item) => item.drone_id === selectedDroneId);
            if (d) setDetailDrone(d);
          }
        }

        if (faultsRes.ok) {
          const fData = await faultsRes.json();
          const pending = (fData.activeFaults || []) as FaultEvent[];
          setActiveFaults(pending);
        }

        if (auditRes.ok) {
          const aData = await auditRes.json();
          setAuditHistory(aData.entries || []);
        }
      } catch (err) {
        console.error("Mission control sync error:", err);
      } finally {
        timer = setTimeout(loadData, 250);
      }
    }

    loadData();
    return () => clearTimeout(timer);
  }, [selectedDroneId]);

  // Show Clock Control
  const toggleClock = useCallback(async (action: "start" | "pause" | "reset") => {
    try {
      await fetch("/api/sync/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error("Failed to toggle clock:", err);
    }
  }, []);

  // Controller Actions Handler
  const handleControllerAction = useCallback(
    async (
      action: "approve" | "reject" | "override",
      params: { reason?: string; notes?: string } = {}
    ) => {
      const targetId = selectedFaultId || (activeFaults.length > 0 ? activeFaults[0].id : null);
      if (!targetId) return;

      try {
        const res = await fetch("/api/controller/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fault_id: targetId,
            action,
            rejection_reason: params.reason,
            override_notes: params.notes,
          }),
        });

        const data = await res.json();
        if (data.message) {
          setActionFeedback(data.message);
          setTimeout(() => setActionFeedback(null), 3500);
        }

        setShowRejectModal(false);
        setShowOverrideModal(false);
      } catch (err) {
        setActionFeedback(`Action error: ${String(err)}`);
      }
    },
    [selectedFaultId, activeFaults]
  );

  // Keyboard Shortcuts ([Y], [N], [O], [Space], [Esc])
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleControllerAction("approve");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowRejectModal(true);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setShowOverrideModal(true);
      } else if (e.key === " ") {
        e.preventDefault();
        toggleClock(snapshot?.is_show_running ? "pause" : "start");
      } else if (e.key === "Escape") {
        setShowRejectModal(false);
        setShowOverrideModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleControllerAction, snapshot?.is_show_running, toggleClock]);

  // Test Fault Injector
  async function triggerFault(action: string, params: Record<string, unknown> = {}) {
    try {
      const res = await fetch("/api/simulator/fault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          drone_id: selectedDroneId || "DRONE-02",
          ...params,
        }),
      });
      const data = await res.json();
      if (data.message) {
        setActionFeedback(data.message);
        setTimeout(() => setActionFeedback(null), 2500);
      }
    } catch (err) {
      setActionFeedback(`Fault error: ${String(err)}`);
    }
  }

  const drones = snapshot?.drones || [];
  const selectedFault =
    activeFaults.find((f) => f.id === selectedFaultId) || (activeFaults.length > 0 ? activeFaults[0] : null);
  const selectedFix = selectedFault?.suggested_fix as unknown as SuggestedFix | null;

  return (
    <main className="h-screen max-h-screen w-screen bg-[#03050a] text-slate-100 p-2.5 flex flex-col gap-2 font-mono select-none overflow-hidden text-xs">
      {/* Top Mission-Control HUD Bar */}
      <header className="h-10 bg-[#060911] border border-[#141e30] rounded px-3 flex items-center justify-between gap-3 shrink-0">
        {/* Brand & Active Show */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-sm text-slate-100 tracking-wider">OMNIMONITOR</span>
            <span className="text-[9px] bg-slate-900 border border-slate-700 text-slate-400 px-1.5 py-0.2 rounded">
              v1.0 COCKPIT
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-800 pl-3 text-slate-400 text-[11px]">
            <span>SHOW:</span>
            <strong className="text-slate-200">{snapshot?.show_name || "Skybrush Vortex"}</strong>
          </div>
        </div>

        {/* Timeline & Playback Controls */}
        <div className="flex items-center gap-2 bg-[#090d1a] border border-[#1a263d] px-2.5 py-1 rounded">
          <span className="text-slate-400 text-[10px]">TIME:</span>
          <span className="text-amber-400 font-bold text-xs tabular-data">
            {((snapshot?.current_show_time_ms || 0) / 1000).toFixed(1)}s
          </span>
          <span className="text-slate-600 text-[10px]">
            / {((snapshot?.show_duration_ms || 60000) / 1000).toFixed(0)}s
          </span>

          <div className="flex items-center gap-1 ml-1.5 border-l border-slate-800 pl-1.5">
            <button
              onClick={() => toggleClock(snapshot?.is_show_running ? "pause" : "start")}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1 text-[10px] transition-colors"
            >
              {snapshot?.is_show_running ? (
                <Pause className="w-2.5 h-2.5 text-amber-400" />
              ) : (
                <Play className="w-2.5 h-2.5 text-emerald-400" />
              )}
              <span>{snapshot?.is_show_running ? "Pause" : "Play"}</span>
            </button>
            <button
              onClick={() => toggleClock("reset")}
              className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded transition-colors"
              title="Reset Clock"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* Fleet Health Quick Counters & Navigation */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
              {snapshot?.healthy_count ?? 12} HEALTHY
            </span>
            {(snapshot?.warning_count ?? 0) > 0 && (
              <span className="text-amber-400 font-bold bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                {snapshot?.warning_count} WARNING
              </span>
            )}
            {(snapshot?.critical_count ?? 0) > 0 && (
              <span className="text-rose-400 font-bold bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded animate-pulse">
                {snapshot?.critical_count} CRITICAL
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            <Link
              href="/import-show"
              className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-800"
              title="Show Plan Importer"
            >
              <FileCode className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/anomalies"
              className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-800"
              title="Thresholds & Anomaly Classifier"
            >
              <Sliders className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 3-Column Zero-Scroll Integrated Cockpit Layout */}
      <div className="flex-1 grid grid-cols-12 gap-2.5 min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* COLUMN 1 (Left 36%): 2D/3D Swarm Spatial Radar & Fleet Matrix Grid */}
        {/* ========================================================================= */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Spatial Radar Formation Canvas */}
          <div className="flex-1 bg-[#060911] border border-[#141e30] rounded p-2 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>Formation Radar</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Selected: <strong className="text-emerald-400">{selectedDroneId}</strong>
              </span>
            </div>

            <div className="flex-1 w-full min-h-0 flex items-center justify-center overflow-hidden">
              <SpatialRadar
                drones={drones}
                selectedDroneId={selectedDroneId}
                onSelectDrone={(id) => setSelectedDroneId(id)}
                previewFix={selectedFix}
              />
            </div>
          </div>

          {/* 12-Drone Fast Selection Matrix */}
          <div className="bg-[#060911] border border-[#141e30] rounded p-2 shrink-0">
            <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1 flex items-center justify-between">
              <span>Swarm Matrix (12 Drones)</span>
              <span>Tap to Inspect</span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 12 }, (_, i) => {
                const id = `DRONE-${String(i + 1).padStart(2, "0")}`;
                const droneData = drones.find((d) => d.drone_id === id);
                const isSelected = id === selectedDroneId;
                const isCrit = droneData?.tier === "critical";
                const isWarn = droneData?.tier === "warning";

                const colorClass = isCrit
                  ? "bg-rose-950/80 border-rose-700 text-rose-300"
                  : isWarn
                  ? "bg-amber-950/80 border-amber-700 text-amber-300"
                  : "bg-slate-900/90 border-slate-800 text-emerald-400";

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedDroneId(id)}
                    className={`py-1 text-center rounded text-[10px] font-bold border transition-all ${colorClass} ${
                      isSelected ? "ring-2 ring-cyan-400" : "hover:border-slate-600"
                    }`}
                  >
                    <div>D{String(i + 1).padStart(2, "0")}</div>
                    <div className="text-[8px] opacity-75 font-normal">
                      {droneData ? `${droneData.composite_health_score.toFixed(0)}` : "--"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Fault Injection Testing Bar */}
          <div className="bg-[#060911] border border-[#141e30] rounded p-2 shrink-0 flex items-center justify-between gap-1 text-[10px]">
            <span className="text-slate-500 font-semibold uppercase">Inject:</span>
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => triggerFault("drift", { dx: 1.8, dy: 1.2, dz: 0.2 })}
                className="px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-700/60 hover:bg-emerald-900/60 text-emerald-300 rounded flex items-center gap-0.5"
                title="Position Drift"
              >
                <Compass className="w-2.5 h-2.5" /> Drift
              </button>
              <button
                onClick={() => triggerFault("battery", { pct: 8.0 })}
                className="px-1.5 py-0.5 bg-rose-950/40 border border-rose-700/60 hover:bg-rose-900/60 text-rose-300 rounded flex items-center gap-0.5"
                title="Battery Low"
              >
                <TrendingDown className="w-2.5 h-2.5" /> Bat 8%
              </button>
              <button
                onClick={() => triggerFault("motor_temp", { motorIndex: 0, tempC: 88.5 })}
                className="px-1.5 py-0.5 bg-red-950/40 border border-red-700/60 hover:bg-red-900/60 text-red-300 rounded flex items-center gap-0.5"
                title="Motor Overheat"
              >
                <Flame className="w-2.5 h-2.5" /> 88°C
              </button>
              <button
                onClick={() => triggerFault("kill_link", { isKilled: true })}
                className="px-1.5 py-0.5 bg-yellow-950/40 border border-yellow-700/60 hover:bg-yellow-900/60 text-yellow-300 rounded flex items-center gap-0.5"
                title="Telemetry Cut"
              >
                <WifiOff className="w-2.5 h-2.5" /> Cut
              </button>
              <button
                onClick={() => triggerFault("reset")}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* COLUMN 2 (Center 34%): Human-in-the-Loop Action Gate & Live Faults Feed */}
        {/* ========================================================================= */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Action Gate (Pinned Top) */}
          <div className="bg-[#060911] border border-[#141e30] rounded p-2.5 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Controller Action Gate
              </span>
              <span className="text-[9px] text-slate-500 flex items-center gap-1">
                <Keyboard className="w-2.5 h-2.5" /> [Y] / [N] / [O]
              </span>
            </div>

            {selectedFault ? (
              <div className="space-y-2">
                {/* Fault Summary */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-100">{selectedFault.drone_id}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        selectedFault.severity === "critical"
                          ? "bg-rose-950 border border-rose-800 text-rose-300"
                          : "bg-amber-950 border border-amber-800 text-amber-300"
                      }`}
                    >
                      {selectedFault.fault_type.replace("_", " ")}
                    </span>
                  </div>
                  <span className="text-[9px] bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                    STATUS: {selectedFault.status.toUpperCase()}
                  </span>
                </div>

                {/* Proposed Fix Card */}
                {selectedFix ? (
                  <div className="bg-[#04060d] border border-[#1a263d] rounded p-2 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between text-slate-300">
                      <div className="flex items-center gap-1 font-bold text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        FIX: {selectedFix.fix_type.toUpperCase()}
                      </div>
                      <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800">
                        CLEARED (Margin: {selectedFix.safety_margin_m}m)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                      <div>
                        Duration: <strong className="text-slate-200">{selectedFix.estimated_duration_s}s</strong>
                      </div>
                      {selectedFix.landing_zone_id && (
                        <div>
                          LZ Target: <strong className="text-slate-200">{selectedFix.landing_zone_id}</strong>
                        </div>
                      )}
                      {selectedFix.min_separation_m !== undefined && (
                        <div>
                          Swarm Clearance: <strong className="text-emerald-400">{selectedFix.min_separation_m.toFixed(2)}m</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 text-center text-slate-500 text-[10px] bg-[#04060d] border border-[#1a263d] rounded">
                    calculating collision-checked suggested fix...
                  </div>
                )}

                {/* Approve / Reject Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    onClick={() => handleControllerAction("approve")}
                    className="py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-emerald-950/40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>APPROVE [Y]</span>
                  </button>

                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="py-2 bg-rose-700 hover:bg-rose-600 text-slate-100 font-bold text-xs rounded flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-rose-950/40"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>REJECT [N]</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-[11px] flex flex-col items-center gap-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-500/40" />
                <span>no pending faults requiring controller action</span>
              </div>
            )}

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div className="p-1.5 bg-amber-950/40 border border-amber-700/60 rounded text-[10px] text-amber-300 flex items-center gap-1">
                <Activity className="w-3 h-3 shrink-0" />
                <span>{actionFeedback}</span>
              </div>
            )}
          </div>

          {/* Tabbed Feed: Live Fault Feed & Session Audit Log */}
          <div className="bg-[#060911] border border-[#141e30] rounded flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-1.5 border-b border-[#141e30] flex items-center justify-between bg-[#04060d] shrink-0 text-[11px]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("faults")}
                  className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                    activeTab === "faults"
                      ? "bg-slate-800 text-amber-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Live Fault Feed ({activeFaults.length})
                </button>
                <button
                  onClick={() => setActiveTab("audit")}
                  className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                    activeTab === "audit"
                      ? "bg-slate-800 text-emerald-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Session Audit ({auditHistory.length})
                </button>
              </div>

              {activeTab === "audit" && (
                <div className="flex items-center gap-1">
                  <a
                    href="/api/controller/audit?format=csv"
                    download="omnimonitor_mission_audit.csv"
                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[9px] rounded border border-slate-700 flex items-center gap-0.5"
                  >
                    <Download className="w-2.5 h-2.5 text-emerald-400" />
                    CSV
                  </a>
                  <a
                    href="/api/controller/audit?format=json_download"
                    download="omnimonitor_mission_audit.json"
                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[9px] rounded border border-slate-700 flex items-center gap-0.5"
                  >
                    <Download className="w-2.5 h-2.5 text-amber-400" />
                    JSON
                  </a>
                </div>
              )}
            </div>

            {/* Scrollable Feed List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#121a2b] min-h-0 text-[11px]">
              {activeTab === "faults" &&
                (activeFaults.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    no active pending faults — swarm safe
                  </div>
                ) : (
                  activeFaults.map((f) => {
                    const isSelected = f.id === selectedFaultId;
                    const isCritical = f.severity === "critical";

                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFaultId(f.id)}
                        className={`p-2 cursor-pointer transition-colors flex items-center justify-between ${
                          isSelected
                            ? "bg-[#0c1322] border-l-2 border-amber-400"
                            : "hover:bg-[#080d19]"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-200">{f.drone_id}</span>
                            <span
                              className={`text-[8px] uppercase px-1 py-0.2 rounded font-bold ${
                                isCritical ? "bg-rose-950 text-rose-300" : "bg-amber-950 text-amber-300"
                              }`}
                            >
                              {f.fault_type.replace("_", " ")}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400">
                            Detected: {new Date(f.detected_at).toLocaleTimeString()}
                          </div>
                        </div>

                        <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? "text-amber-400" : "text-slate-600"}`} />
                      </div>
                    );
                  })
                ))}

              {activeTab === "audit" &&
                (auditHistory.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    no audit decisions recorded yet
                  </div>
                ) : (
                  auditHistory.map((item) => (
                    <div key={item.id} className="p-2 space-y-0.5 hover:bg-[#080d19] transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{item.drone_id}</span>
                        <span
                          className={`text-[8px] uppercase px-1 py-0.2 rounded font-bold ${
                            item.decision === "approved"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-rose-950 text-rose-300 border border-rose-800"
                          }`}
                        >
                          {item.decision}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[9px]">
                        {item.fault_type} • {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                      {item.rejection_reason && (
                        <div className="text-rose-300 text-[9px] italic">
                          Reason: {item.rejection_reason}
                        </div>
                      )}
                    </div>
                  ))
                ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* COLUMN 3 (Right 30%): Live Drone Deep Telemetry (Always Visible on Screen) */}
        {/* ========================================================================= */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden">
          {detailDrone ? (
            <div className="bg-[#060911] border border-[#141e30] rounded p-2.5 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
              {/* Drone Header & Composite Score */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-xs text-slate-100">{detailDrone.drone_id} Inspector</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">Score:</span>
                  <span
                    className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                      detailDrone.tier === "critical"
                        ? "bg-rose-950 text-rose-400 border border-rose-800"
                        : detailDrone.tier === "warning"
                        ? "bg-amber-950 text-amber-400 border border-amber-800"
                        : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    }`}
                  >
                    {detailDrone.composite_health_score.toFixed(1)} / 100
                  </span>
                </div>
              </div>

              {/* 4 Core Vital Cards */}
              <div className="grid grid-cols-2 gap-1.5 shrink-0 text-[10px]">
                {/* Drift */}
                <div className="bg-[#04060d] border border-[#1a263d] p-1.5 rounded">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Navigation className="w-2.5 h-2.5 text-cyan-400" /> Drift (3D)
                  </div>
                  <div className="text-slate-200 font-bold mt-0.5">
                    {detailDrone.position_delta_m.toFixed(2)}m
                  </div>
                </div>

                {/* Battery */}
                <div className="bg-[#04060d] border border-[#1a263d] p-1.5 rounded">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Battery className="w-2.5 h-2.5 text-amber-400" /> Battery
                  </div>
                  <div className="text-slate-200 font-bold mt-0.5">
                    {detailDrone.battery_pct.toFixed(0)}% ({detailDrone.battery_voltage.toFixed(1)}V)
                  </div>
                </div>

                {/* RF Link */}
                <div className="bg-[#04060d] border border-[#1a263d] p-1.5 rounded">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Wifi className="w-2.5 h-2.5 text-emerald-400" /> RF Link
                  </div>
                  <div className="text-slate-200 font-bold mt-0.5">
                    {detailDrone.link_quality.toFixed(0)}% ({detailDrone.rssi_dbm}dBm)
                  </div>
                </div>

                {/* Motor Temp */}
                <div className="bg-[#04060d] border border-[#1a263d] p-1.5 rounded">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Gauge className="w-2.5 h-2.5 text-rose-400" /> Max Motor Temp
                  </div>
                  <div className="text-slate-200 font-bold mt-0.5">
                    {detailDrone.motor_temp_max.toFixed(1)}°C
                  </div>
                </div>
              </div>

              {/* 4 Motors Thermal Array Readout */}
              <div className="bg-[#04060d] border border-[#1a263d] p-2 rounded shrink-0 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">
                  4-Motor Thermal Array (°C)
                </span>
                <div className="grid grid-cols-4 gap-1 text-center font-bold text-[10px]">
                  {detailDrone.motor_temps.map((temp, i) => (
                    <div
                      key={i}
                      className={`p-1 rounded border ${
                        temp > 85
                          ? "bg-rose-950/60 border-rose-700 text-rose-300"
                          : temp > 75
                          ? "bg-amber-950/60 border-amber-700 text-amber-300"
                          : "bg-slate-900 border-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="text-[8px] text-slate-500">M{i + 1}</div>
                      <div>{temp.toFixed(1)}°</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3D Coordinates (Actual vs Intended) */}
              <div className="bg-[#04060d] border border-[#1a263d] p-2 rounded shrink-0 space-y-1 text-[10px]">
                <span className="text-slate-400 uppercase font-semibold">3D Spatial Tracking (m)</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Actual: </span>
                    <span className="text-slate-200 font-bold">
                      X:{detailDrone.actual_position?.x?.toFixed(1) ?? 0} Y:
                      {detailDrone.actual_position?.y?.toFixed(1) ?? 0} Z:
                      {detailDrone.actual_position?.z?.toFixed(1) ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Intended: </span>
                    <span className="text-slate-400">
                      X:{detailDrone.intended_position?.x?.toFixed(1) ?? 0} Y:
                      {detailDrone.intended_position?.y?.toFixed(1) ?? 0} Z:
                      {detailDrone.intended_position?.z?.toFixed(1) ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live JSON Packet Stream */}
              <div className="bg-[#04060d] border border-[#1a263d] p-2 rounded flex-1 flex flex-col min-h-0 overflow-hidden">
                <span className="text-slate-400 text-[9px] uppercase font-semibold mb-1">
                  Raw Ingested Packet (5Hz Stream)
                </span>
                <pre className="flex-1 text-[9px] text-slate-300 font-mono overflow-auto p-1.5 bg-black/60 rounded border border-slate-900 min-h-0">
                  {JSON.stringify(detailDrone.raw_telemetry, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="bg-[#060911] border border-[#141e30] rounded p-6 flex-1 flex items-center justify-center text-slate-500 text-center">
              select any drone from the matrix or radar to inspect telemetry
            </div>
          )}
        </section>
      </div>

      {/* Reject Modal Prompt */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
          <div className="bg-[#060911] border border-rose-800 rounded p-4 max-w-md w-full font-mono text-xs space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-rose-900/50 pb-1.5">
              <span className="font-bold text-rose-400 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                Reject Suggested Fix — Mandatory Reason
              </span>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-slate-300 text-[11px]">
              Provide a reason for rejecting the automated trajectory fix for <strong>{selectedFault?.drone_id}</strong>:
            </p>

            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-[#03050a] border border-slate-700 text-slate-100 p-2 rounded text-xs focus:outline-none focus:border-rose-500"
              placeholder="e.g. Manual visual obstruction or wind gust"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleControllerAction("reject", { reason: rejectionReason })}
                className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-slate-100 font-bold rounded text-xs"
              >
                Confirm Reject [Enter]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal Prompt */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
          <div className="bg-[#060911] border border-amber-800 rounded p-4 max-w-md w-full font-mono text-xs space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-900/50 pb-1.5">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                Manual Controller Override [O]
              </span>
              <button onClick={() => setShowOverrideModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-slate-300 text-[11px]">
              Record controller manual override notes for <strong>{selectedFault?.drone_id}</strong>:
            </p>

            <input
              type="text"
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              className="w-full bg-[#03050a] border border-slate-700 text-slate-100 p-2 rounded text-xs focus:outline-none focus:border-amber-500"
              placeholder="e.g. Controller manual stick override executed"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleControllerAction("override", { notes: overrideNotes })}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
