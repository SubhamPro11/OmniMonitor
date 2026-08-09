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
  const [prevScores, setPrevScores] = useState<Record<string, number>>({});

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
          if (hData.drones) {
            if (selectedDroneId) {
              const d = hData.drones.find((item) => item.drone_id === selectedDroneId);
              if (d) setDetailDrone(d);
            }
            // Update historical scores map
            setPrevScores((prev) => {
              const next: Record<string, number> = { ...prev };
              hData.drones.forEach((d) => {
                next[d.drone_id] = d.composite_health_score;
              });
              return next;
            });
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
    <main className="h-screen max-h-screen w-screen bg-[#070b14] text-[#f1f5f9] p-2 flex flex-col gap-2 font-mono select-none overflow-hidden text-xs">
      {/* Top Mission-Control HUD Bar */}
      <header className="h-10 bg-[#0b1120] border border-[#1e2d4a] px-3 flex items-center justify-between gap-3 shrink-0 font-mono">
        {/* Brand & Active Show */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-[#22c55e] shadow-[0_0_8px_#22c55e] animate-pulse" />
            <span className="font-bold text-sm text-[#4ade80] tracking-wider">OMNIMONITOR</span>
            <span className="text-[10px] bg-[#10192e] border border-[#1e2d4a] text-[#4ade80] px-1.5 py-0.5 font-bold font-mono">
              [ v1.0 COCKPIT ]
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 border-l border-[#1e2d4a] pl-3 text-[#94a3b8] text-[11px]">
            <span>SHOW:</span>
            <span className="text-[#f1f5f9] bg-[#10192e] border border-[#1e2d4a] px-2 py-0.5 font-semibold font-mono">
              [ {snapshot?.show_name || "Skybrush Vortex"} ]
            </span>
          </div>
        </div>

        {/* Timeline & Playback Controls */}
        <div className="flex items-center gap-2 bg-[#10192e] border border-[#1e2d4a] px-2.5 py-1 font-mono">
          <span className="text-[#94a3b8] text-[10px]">TIME:</span>
          <span className="bg-[#070b14] border border-[#1e2d4a] px-2 py-0.5 text-[#4ade80] font-bold text-xs tabular-data">
            [ {((snapshot?.current_show_time_ms || 0) / 1000).toFixed(1)}s / {((snapshot?.show_duration_ms || 60000) / 1000).toFixed(0)}s ]
          </span>

          <div className="flex items-center gap-1 ml-1 border-l border-[#1e2d4a] pl-1.5">
            <button
              onClick={() => toggleClock(snapshot?.is_show_running ? "pause" : "start")}
              className="px-2.5 py-0.5 bg-[#17233f] hover:bg-[#1f3056] active:bg-[#253966] text-[#f1f5f9] flex items-center gap-1 text-[10px] transition-colors border border-[#1e2d4a] hover:border-[#22c55e]/50 font-mono focus-visible:outline-none focus-visible:border-[#4ade80]"
            >
              {snapshot?.is_show_running ? (
                <>
                  <Pause className="w-2.5 h-2.5 text-[#f59e0b]" />
                  <span>[ ⏸ PAUSE ]</span>
                </>
              ) : (
                <>
                  <Play className="w-2.5 h-2.5 text-[#22c55e]" />
                  <span>[ ▶ PLAY ]</span>
                </>
              )}
            </button>
            <button
              onClick={() => toggleClock("reset")}
              className="px-1.5 py-0.5 bg-[#10192e] hover:bg-[#17233f] active:bg-[#1f3056] text-[#94a3b8] hover:text-[#4ade80] transition-colors border border-[#1e2d4a] hover:border-[#22c55e]/50 font-mono"
              title="Reset Show Clock"
            >
              [ ↺ RESET ]
            </button>
          </div>
        </div>

        {/* Fleet Health Quick Counters & Navigation */}
        <div className="flex items-center gap-2.5 font-mono">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[#4ade80] font-bold bg-[#22c55e]/10 border border-[#22c55e]/30 px-2 py-0.5">
              [ {snapshot?.healthy_count ?? 12} HEALTHY ]
            </span>
            {(snapshot?.warning_count ?? 0) > 0 && (
              <span className="text-[#fbbf24] font-bold bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2 py-0.5">
                [ {snapshot?.warning_count} WARNING ]
              </span>
            )}
            {(snapshot?.critical_count ?? 0) > 0 && (
              <span className="text-[#f87171] font-bold bg-[#ef4444]/15 border border-[#ef4444]/40 px-2 py-0.5 animate-pulse">
                [ {snapshot?.critical_count} CRITICAL ]
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 border-l border-[#1e2d4a] pl-2">
            <Link
              href="/import-show"
              className="px-2 py-0.5 bg-[#10192e] hover:bg-[#17233f] active:bg-[#1f3056] text-[#94a3b8] hover:text-[#4ade80] border border-[#1e2d4a] hover:border-[#22c55e]/50 transition-colors text-[10px] flex items-center gap-1 font-mono"
              title="Show Plan Importer"
            >
              <FileCode className="w-3 h-3 text-[#4ade80]" />
              <span>[ IMP ]</span>
            </Link>
            <Link
              href="/anomalies"
              className="px-2 py-0.5 bg-[#10192e] hover:bg-[#17233f] active:bg-[#1f3056] text-[#94a3b8] hover:text-[#4ade80] border border-[#1e2d4a] hover:border-[#22c55e]/50 transition-colors text-[10px] flex items-center gap-1 font-mono"
              title="Thresholds & Anomaly Classifier"
            >
              <Sliders className="w-3 h-3 text-[#fbbf24]" />
              <span>[ CFG ]</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3-Column Zero-Scroll Integrated Cockpit Layout */}
      <div className="flex-1 grid grid-cols-12 gap-2 min-h-0 overflow-hidden font-mono">
        {/* ========================================================================= */}
        {/* COLUMN 1 (Left 36%): 2D/3D Swarm Spatial Radar & Fleet Matrix Grid */}
        {/* ========================================================================= */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Spatial Radar Formation Canvas */}
          <div className="flex-1 bg-[#0b1120] border border-[#1e2d4a] p-2 flex flex-col min-h-0 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4ade80] uppercase tracking-wider font-mono">
                <Radio className="w-3.5 h-3.5 text-[#22c55e]" />
                <span>Formation Radar</span>
              </div>
              <span className="text-[10px] text-[#94a3b8]">
                Selected: <strong className="text-[#4ade80] font-mono">[ {selectedDroneId} ]</strong>
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
          <div className="bg-[#0b1120] border border-[#1e2d4a] p-2 shrink-0">
            <div className="text-[10px] text-[#94a3b8] uppercase font-semibold mb-1.5 flex items-center justify-between">
              <span>Swarm Matrix (12 Drones)</span>
              <span className="text-[#4ade80]">[ TAP TO INSPECT ]</span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 12 }, (_, i) => {
                const id = `DRONE-${String(i + 1).padStart(2, "0")}`;
                const droneData = drones.find((d) => d.drone_id === id);
                const isSelected = id === selectedDroneId;
                const isCrit = droneData?.tier === "critical";
                const isWarn = droneData?.tier === "warning";

                // Visual cues & primary fault flag (already present data)
                let faultCue = "OK";
                if (droneData) {
                  if (droneData.battery_pct < 20) faultCue = "BAT";
                  else if (droneData.position_delta_m > 1.0) faultCue = "DRIFT";
                  else if (droneData.motor_temp_max > 75) faultCue = "TEMP";
                  else if (droneData.link_quality < 70) faultCue = "LINK";
                }

                const prevScore = prevScores[id];
                const currScore = droneData?.composite_health_score ?? 100;
                let trendGlyph = "■";
                let trendColor = "text-[#64748b]";
                if (prevScore !== undefined) {
                  if (currScore > prevScore + 0.1) {
                    trendGlyph = "▲";
                    trendColor = "text-[#4ade80]";
                  } else if (currScore < prevScore - 0.1) {
                    trendGlyph = "▼";
                    trendColor = isCrit ? "text-[#f87171]" : "text-[#fbbf24]";
                  }
                }

                const colorClass = isCrit
                  ? "border-l-[3px] border-l-[#ef4444] bg-[#ef4444]/15 border-[#ef4444]/40 text-[#f87171] hover:bg-[#ef4444]/25"
                  : isWarn
                  ? "border-l-[3px] border-l-[#f59e0b] bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#fbbf24] hover:bg-[#f59e0b]/25"
                  : "border-l-[3px] border-l-[#22c55e] bg-[#10192e] border-[#1e2d4a] text-[#4ade80] hover:bg-[#17233f] hover:border-[#22c55e]/40";

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedDroneId(id)}
                    className={`p-1 text-left text-[10px] font-bold border transition-all font-mono active:scale-[0.97] flex flex-col justify-between h-[42px] ${colorClass} ${
                      isSelected
                        ? "ring-2 ring-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.4)] bg-[#17233f]"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] w-full">
                      <span>D{String(i + 1).padStart(2, "0")}</span>
                      <span
                        className={`text-[7.5px] px-1 py-0.2 font-mono font-bold ${
                          isCrit
                            ? "bg-[#ef4444]/30 text-[#f87171]"
                            : isWarn
                            ? "bg-[#f59e0b]/30 text-[#fbbf24]"
                            : "text-[#64748b]"
                        }`}
                      >
                        {faultCue}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between text-[9px] font-normal tabular-data w-full">
                      <span className="font-bold">
                        {droneData ? `${droneData.composite_health_score.toFixed(0)}` : "--"}
                      </span>
                      <span className={`text-[8px] ${trendColor}`}>{trendGlyph}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Fault Injection Testing Bar (Tie to Semantic Status Colors) */}
          <div className="bg-[#0b1120] border border-[#1e2d4a] p-2 shrink-0 flex items-center justify-between gap-1 text-[10px] font-mono">
            <span className="text-[#94a3b8] font-semibold uppercase shrink-0">Inject:</span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {/* Drift: Warning -> Amber */}
              <button
                onClick={() => triggerFault("drift", { dx: 1.8, dy: 1.2, dz: 0.2 })}
                className="px-1.5 py-0.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 hover:bg-[#f59e0b]/25 hover:border-[#f59e0b] active:scale-[0.98] text-[#fbbf24] flex items-center gap-0.5 font-mono transition-all"
                title="Inject Position Drift (+1.8m)"
              >
                <Compass className="w-2.5 h-2.5" /> [ DRIFT ]
              </button>
              {/* Battery: Critical -> Red */}
              <button
                onClick={() => triggerFault("battery", { pct: 8.0 })}
                className="px-1.5 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/30 hover:bg-[#ef4444]/25 hover:border-[#ef4444] active:scale-[0.98] text-[#f87171] flex items-center gap-0.5 font-mono transition-all"
                title="Inject Low Battery (8%)"
              >
                <TrendingDown className="w-2.5 h-2.5" /> [ BAT 8% ]
              </button>
              {/* Motor Temp: Critical -> Red */}
              <button
                onClick={() => triggerFault("motor_temp", { motorIndex: 0, tempC: 88.5 })}
                className="px-1.5 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/30 hover:bg-[#ef4444]/25 hover:border-[#ef4444] active:scale-[0.98] text-[#f87171] flex items-center gap-0.5 font-mono transition-all"
                title="Inject Motor Overheat (88.5°C)"
              >
                <Flame className="w-2.5 h-2.5" /> [ 88°C ]
              </button>
              {/* Telemetry Cut: Warning -> Amber */}
              <button
                onClick={() => triggerFault("kill_link", { isKilled: true })}
                className="px-1.5 py-0.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 hover:bg-[#f59e0b]/25 hover:border-[#f59e0b] active:scale-[0.98] text-[#fbbf24] flex items-center gap-0.5 font-mono transition-all"
                title="Inject Telemetry RF Cut"
              >
                <WifiOff className="w-2.5 h-2.5" /> [ CUT ]
              </button>
              {/* Reset: Nominal -> Lime */}
              <button
                onClick={() => triggerFault("reset")}
                className="px-1.5 py-0.5 bg-[#22c55e]/10 hover:bg-[#22c55e]/25 hover:border-[#22c55e] active:scale-[0.98] text-[#4ade80] border border-[#22c55e]/30 font-mono transition-all"
                title="Reset All Swarm Injections to Nominal"
              >
                [ RESET ]
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* COLUMN 2 (Center 34%): Human-in-the-Loop Action Gate & Live Faults Feed */}
        {/* ========================================================================= */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden font-mono">
          {/* Action Gate (Pinned Top) */}
          <div className="bg-[#0b1120] border border-[#1e2d4a] p-2.5 flex flex-col gap-2 shrink-0 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#141f33] pb-1.5">
              <span className="font-bold text-xs text-[#4ade80] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-[#22c55e]" />
                Controller Action Gate
              </span>
              <span className="text-[10px] text-[#94a3b8] flex items-center gap-1 font-mono">
                <Keyboard className="w-2.5 h-2.5 text-[#4ade80]" /> [ Y / N / O ]
              </span>
            </div>

            {selectedFault ? (
              <div className="space-y-2">
                {/* Fault Summary */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-[#f1f5f9] font-mono">[ {selectedFault.drone_id} ]</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 font-mono ${
                        selectedFault.severity === "critical"
                          ? "bg-[#ef4444]/15 border border-[#ef4444]/50 text-[#f87171]"
                          : "bg-[#f59e0b]/15 border border-[#f59e0b]/50 text-[#fbbf24]"
                      }`}
                    >
                      [ {selectedFault.fault_type.replace("_", " ")} ]
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#10192e] border border-[#1e2d4a] px-1.5 py-0.5 text-[#4ade80] font-semibold font-mono">
                    STATUS: [ {selectedFault.status.toUpperCase()} ]
                  </span>
                </div>

                {/* Proposed Fix Card */}
                {selectedFix ? (
                  <div className="bg-[#070b14] border border-[#1e2d4a] p-2 text-[11px] space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-slate-300">
                      <div className="flex items-center gap-1 font-bold text-[#4ade80]">
                        <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                        FIX: [ {selectedFix.fix_type.toUpperCase()} ]
                      </div>
                      <span className="text-[9px] text-[#4ade80] bg-[#22c55e]/10 px-1.5 py-0.5 border border-[#22c55e]/30 font-mono">
                        [ CLEARED • MARGIN: {selectedFix.safety_margin_m}m ]
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] text-[#94a3b8]">
                      <div>
                        Duration: <strong className="text-[#f1f5f9]">[ {selectedFix.estimated_duration_s}s ]</strong>
                      </div>
                      {selectedFix.landing_zone_id && (
                        <div>
                          LZ Target: <strong className="text-[#4ade80]">[ {selectedFix.landing_zone_id} ]</strong>
                        </div>
                      )}
                      {selectedFix.min_separation_m !== undefined && (
                        <div>
                          Swarm Clearance: <strong className="text-[#4ade80]">[ {selectedFix.min_separation_m.toFixed(2)}m ]</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 text-center text-[#94a3b8] text-[10px] bg-[#070b14] border border-[#141f33]">
                    [ CALCULATING COLLISION-CHECKED FIX... ]
                  </div>
                )}

                {/* Approve / Reject Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono">
                  <button
                    onClick={() => handleControllerAction("approve")}
                    className="py-2 bg-[#22c55e] hover:bg-[#4ade80] active:bg-[#16a34a] text-[#050811] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-[#22c55e] shadow-md shadow-[#22c55e]/20 font-mono active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#050811]" />
                    <span>[ APPROVE (Y) ]</span>
                  </button>

                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="py-2 bg-[#ef4444] hover:bg-[#f87171] active:bg-[#dc2626] text-[#ffffff] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-[#ef4444] shadow-md shadow-[#ef4444]/20 font-mono active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f87171]"
                  >
                    <XCircle className="w-3.5 h-3.5 text-[#ffffff]" />
                    <span>[ REJECT (N) ]</span>
                  </button>
                </div>
              </div>
            ) : (
              /* High-Density Collapsed State: Single-Line Status when No Action Required */
              <div className="py-1.5 px-2.5 bg-[#070b14] border border-[#141f33] text-[10px] flex items-center justify-between text-[#94a3b8] font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#22c55e] shadow-[0_0_6px_#22c55e]" />
                  <span className="text-[#cbd5e1] font-semibold">[ SWARM CLEAR • NO ACTION REQUIRED ]</span>
                </div>
                <span className="text-[#64748b] text-[9px]">[ STANDBY ]</span>
              </div>
            )}

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div className="p-1.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[10px] text-[#fbbf24] flex items-center gap-1 font-mono">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>[ {actionFeedback} ]</span>
              </div>
            )}
          </div>

          {/* Tabbed Feed: Live Fault Feed & Session Audit Log */}
          <div className="bg-[#0b1120] border border-[#1e2d4a] flex-1 flex flex-col min-h-0 overflow-hidden font-mono">
            <div className="p-1.5 border-b border-[#141f33] flex items-center justify-between bg-[#070b14] shrink-0 text-[11px]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("faults")}
                  className={`px-2 py-0.5 font-semibold transition-colors font-mono border ${
                    activeTab === "faults"
                      ? "bg-[#17233f] text-[#4ade80] border-[#22c55e]/50"
                      : "text-[#94a3b8] border-transparent hover:text-[#f1f5f9] hover:bg-[#10192e]"
                  }`}
                >
                  [ LIVE FAULTS ({activeFaults.length}) ]
                </button>
                <button
                  onClick={() => setActiveTab("audit")}
                  className={`px-2 py-0.5 font-semibold transition-colors font-mono border ${
                    activeTab === "audit"
                      ? "bg-[#17233f] text-[#4ade80] border-[#22c55e]/50"
                      : "text-[#94a3b8] border-transparent hover:text-[#f1f5f9] hover:bg-[#10192e]"
                  }`}
                >
                  [ SESSION AUDIT ({auditHistory.length}) ]
                </button>
              </div>

              {activeTab === "audit" && (
                <div className="flex items-center gap-1">
                  <a
                    href="/api/controller/audit?format=csv"
                    download="omnimonitor_mission_audit.csv"
                    className="px-1.5 py-0.5 bg-[#10192e] hover:bg-[#17233f] active:bg-[#1f3056] text-[#4ade80] text-[9px] border border-[#1e2d4a] hover:border-[#22c55e]/50 flex items-center gap-0.5 transition-colors font-mono"
                  >
                    <Download className="w-2.5 h-2.5 text-[#22c55e]" />
                    [ CSV ]
                  </a>
                  <a
                    href="/api/controller/audit?format=json_download"
                    download="omnimonitor_mission_audit.json"
                    className="px-1.5 py-0.5 bg-[#10192e] hover:bg-[#17233f] active:bg-[#1f3056] text-[#fbbf24] text-[9px] border border-[#1e2d4a] hover:border-[#f59e0b]/50 flex items-center gap-0.5 transition-colors font-mono"
                  >
                    <Download className="w-2.5 h-2.5 text-[#f59e0b]" />
                    [ JSON ]
                  </a>
                </div>
              )}
            </div>

            {/* Feed List (Compact Single-Line when Empty, Expands to Scrollable List when Populated) */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#141f33] min-h-0 text-[11px] font-mono">
              {activeTab === "faults" &&
                (activeFaults.length === 0 ? (
                  <div className="py-2.5 px-3 flex items-center justify-between text-[#64748b] text-[10px] bg-[#070b14]/50">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#22c55e]/70" />
                      [ NO ACTIVE FAULTS • FLEET NOMINAL ]
                    </span>
                    <span className="text-[9px] text-[#475569]">[ 0 DETECTIONS ]</span>
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
                            ? "bg-[#10192e] border-l-2 border-[#22c55e]"
                            : "hover:bg-[#0f172a]"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#f1f5f9]">[ {f.drone_id} ]</span>
                            <span
                              className={`text-[8px] uppercase px-1 py-0.2 font-bold ${
                                isCritical ? "bg-[#ef4444]/20 text-[#f87171] border border-[#ef4444]/40" : "bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/40"
                              }`}
                            >
                              [ {f.fault_type.replace("_", " ")} ]
                            </span>
                          </div>
                          <div className="text-[9px] text-[#94a3b8]">
                            DETECTED: {new Date(f.detected_at).toLocaleTimeString()}
                          </div>
                        </div>

                        <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? "text-[#4ade80]" : "text-[#475569]"}`} />
                      </div>
                    );
                  })
                ))}

              {activeTab === "audit" &&
                (auditHistory.length === 0 ? (
                  <div className="py-2.5 px-3 flex items-center justify-between text-[#64748b] text-[10px] bg-[#070b14]/50">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#64748b]/50" />
                      [ NO AUDIT LOGS RECORDED IN THIS SESSION ]
                    </span>
                    <span className="text-[9px] text-[#475569]">[ 0 ACTIONS ]</span>
                  </div>
                ) : (
                  auditHistory.map((item) => (
                    <div key={item.id} className="p-2 space-y-0.5 hover:bg-[#0f172a] transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#f1f5f9]">[ {item.drone_id} ]</span>
                        <span
                          className={`text-[8px] uppercase px-1 py-0.2 font-bold ${
                            item.decision === "approved"
                              ? "bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30"
                              : "bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30"
                          }`}
                        >
                          [ {item.decision.toUpperCase()} ]
                        </span>
                      </div>
                      <div className="text-[#94a3b8] text-[9px]">
                        {item.fault_type} • {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                      {item.rejection_reason && (
                        <div className="text-[#f87171] text-[9px] italic">
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
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-2 min-h-0 overflow-hidden font-mono">
          {detailDrone ? (
            <div className="bg-[#0b1120] border border-[#1e2d4a] p-2.5 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden shadow-sm">
              {/* Drone Header & Composite Score */}
              <div className="flex items-center justify-between border-b border-[#141f33] pb-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span className="font-bold text-xs text-[#f1f5f9]">[ {detailDrone.drone_id} INSPECTOR ]</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#94a3b8]">SCORE:</span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 font-mono ${
                      detailDrone.tier === "critical"
                        ? "bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/40"
                        : detailDrone.tier === "warning"
                        ? "bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/40"
                        : "bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/40"
                    }`}
                  >
                    [ {detailDrone.composite_health_score.toFixed(1)} / 100 ]
                  </span>
                </div>
              </div>

              {/* 4 Core Vital Cards */}
              <div className="grid grid-cols-2 gap-1.5 shrink-0 text-[10px] font-mono">
                {/* Drift */}
                <div className="bg-[#070b14] border border-[#1e2d4a] p-1.5">
                  <div className="text-[#94a3b8] flex items-center gap-1">
                    <Navigation className="w-2.5 h-2.5 text-[#4ade80]" /> DRIFT (3D)
                  </div>
                  <div className="text-[#f1f5f9] font-bold mt-0.5">
                    [ {detailDrone.position_delta_m.toFixed(2)}m ]
                  </div>
                </div>

                {/* Battery */}
                <div className="bg-[#070b14] border border-[#1e2d4a] p-1.5">
                  <div className="text-[#94a3b8] flex items-center gap-1">
                    <Battery className="w-2.5 h-2.5 text-[#4ade80]" /> BATTERY
                  </div>
                  <div className="text-[#f1f5f9] font-bold mt-0.5">
                    [ {detailDrone.battery_pct.toFixed(0)}% ({detailDrone.battery_voltage.toFixed(1)}V) ]
                  </div>
                </div>

                {/* RF Link */}
                <div className="bg-[#070b14] border border-[#1e2d4a] p-1.5">
                  <div className="text-[#94a3b8] flex items-center gap-1">
                    <Wifi className="w-2.5 h-2.5 text-[#4ade80]" /> RF LINK
                  </div>
                  <div className="text-[#f1f5f9] font-bold mt-0.5">
                    [ {detailDrone.link_quality.toFixed(0)}% ({detailDrone.rssi_dbm}dBm) ]
                  </div>
                </div>

                {/* Motor Temp */}
                <div className="bg-[#070b14] border border-[#1e2d4a] p-1.5">
                  <div className="text-[#94a3b8] flex items-center gap-1">
                    <Gauge className="w-2.5 h-2.5 text-[#fbbf24]" /> MAX MOTOR TEMP
                  </div>
                  <div className="text-[#f1f5f9] font-bold mt-0.5">
                    [ {detailDrone.motor_temp_max.toFixed(1)}°C ]
                  </div>
                </div>
              </div>

              {/* 4 Motors Thermal Array Readout */}
              <div className="bg-[#070b14] border border-[#1e2d4a] p-2 shrink-0 space-y-1 font-mono">
                <span className="text-[#94a3b8] text-[10px] uppercase font-semibold">
                  4-Motor Thermal Array (°C)
                </span>
                <div className="grid grid-cols-4 gap-1 text-center font-bold text-[10px]">
                  {detailDrone.motor_temps.map((temp, i) => (
                    <div
                      key={i}
                      className={`p-1 border font-mono ${
                        temp > 85
                          ? "bg-[#ef4444]/15 border-[#ef4444]/40 text-[#f87171]"
                          : temp > 75
                          ? "bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#fbbf24]"
                          : "bg-[#10192e] border-[#1e2d4a] text-[#4ade80]"
                      }`}
                    >
                      <div className="text-[8px] text-[#64748b]">M{i + 1}</div>
                      <div>{temp.toFixed(1)}°</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3D Coordinates (Actual vs Intended + Explicit Computed Delta) */}
              <div className="bg-[#070b14] border border-[#1e2d4a] p-2 shrink-0 space-y-1.5 text-[10px] font-mono">
                {(() => {
                  const actX = detailDrone.actual_position?.x ?? 0;
                  const actY = detailDrone.actual_position?.y ?? 0;
                  const actZ = detailDrone.actual_position?.z ?? 0;
                  const intX = detailDrone.intended_position?.x ?? actX;
                  const intY = detailDrone.intended_position?.y ?? actY;
                  const intZ = detailDrone.intended_position?.z ?? actZ;
                  const dx = actX - intX;
                  const dy = actY - intY;
                  const dz = actZ - intZ;
                  const totalDelta = detailDrone.position_delta_m ?? Math.sqrt(dx * dx + dy * dy + dz * dz);

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[#94a3b8] uppercase font-semibold">3D Spatial Tracking (m)</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 font-bold ${
                            totalDelta > 2.0
                              ? "bg-[#ef4444]/20 text-[#f87171] border border-[#ef4444]/40"
                              : totalDelta > 0.8
                              ? "bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/40"
                              : "bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30"
                          }`}
                        >
                          [ Δ 3D: {totalDelta.toFixed(2)}m ]
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[#64748b]">ACTUAL: </span>
                          <span className="text-[#4ade80] font-bold">
                            [ X:{actX.toFixed(1)} Y:{actY.toFixed(1)} Z:{actZ.toFixed(1)} ]
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748b]">INTENDED: </span>
                          <span className="text-[#94a3b8]">
                            [ X:{intX.toFixed(1)} Y:{intY.toFixed(1)} Z:{intZ.toFixed(1)} ]
                          </span>
                        </div>
                      </div>
                      {/* Explicit Per-Axis Delta */}
                      <div className="pt-1 border-t border-[#141f33] flex items-center justify-between text-[9px] text-[#94a3b8]">
                        <span>AXIS DELTAS:</span>
                        <span className="text-[#cbd5e1] font-mono">
                          ΔX: <strong className={Math.abs(dx) > 0.5 ? "text-[#fbbf24]" : "text-[#4ade80]"}>{dx >= 0 ? `+${dx.toFixed(2)}` : dx.toFixed(2)}m</strong> • 
                          ΔY: <strong className={Math.abs(dy) > 0.5 ? "text-[#fbbf24]" : "text-[#4ade80]"}>{dy >= 0 ? `+${dy.toFixed(2)}` : dy.toFixed(2)}m</strong> • 
                          ΔZ: <strong className={Math.abs(dz) > 0.5 ? "text-[#fbbf24]" : "text-[#4ade80]"}>{dz >= 0 ? `+${dz.toFixed(2)}` : dz.toFixed(2)}m</strong>
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Live JSON Packet Stream with Monospace Navy/Lime Syntax Highlighting */}
              <div className="bg-[#070b14] border border-[#1e2d4a] p-2 flex-1 flex flex-col min-h-0 overflow-hidden font-mono">
                <div className="flex items-center justify-between mb-1 shrink-0">
                  <span className="text-[#94a3b8] text-[9px] uppercase font-semibold">
                    Raw Ingested Packet (5Hz Stream)
                  </span>
                  <span className="text-[8px] text-[#64748b] font-mono">[ JSON • 5Hz ]</span>
                </div>
                <div className="flex-1 text-[9px] font-mono overflow-auto p-1.5 bg-[#050811] border border-[#141f33] min-h-0 leading-tight select-text">
                  {(() => {
                    if (!detailDrone.raw_telemetry) return <span className="text-[#64748b]">no telemetry packet received</span>;
                    const jsonLines = JSON.stringify(detailDrone.raw_telemetry, null, 2).split("\n");
                    return jsonLines.map((line, idx) => {
                      const match = line.match(/^(\s*)(".*?")(\s*:\s*)(.*)$/);
                      if (match) {
                        const [, indent, key, colon, rawVal] = match;
                        const trimmedVal = rawVal.trim();
                        const isTrailingComma = trimmedVal.endsWith(",");
                        const cleanVal = isTrailingComma ? trimmedVal.slice(0, -1) : trimmedVal;

                        let valElem = <span className="text-[#cbd5e1]">{cleanVal}</span>;
                        if (cleanVal.startsWith('"')) {
                          valElem = <span className="text-[#94a3b8]">{cleanVal}</span>;
                        } else if (!isNaN(Number(cleanVal))) {
                          valElem = <span className="text-[#f1f5f9] font-bold">{cleanVal}</span>;
                        } else if (cleanVal === "true" || cleanVal === "false") {
                          valElem = <span className="text-[#fbbf24] font-bold">{cleanVal}</span>;
                        } else if (cleanVal === "null") {
                          valElem = <span className="text-[#f87171]">{cleanVal}</span>;
                        }

                        return (
                          <div key={idx} className="whitespace-pre">
                            <span>{indent}</span>
                            <span className="text-[#4ade80] font-semibold">{key}</span>
                            <span className="text-[#64748b]">{colon}</span>
                            {valElem}
                            {isTrailingComma && <span className="text-[#64748b]">,</span>}
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="text-[#64748b] whitespace-pre">
                          {line}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#0b1120] border border-[#1e2d4a] p-6 flex-1 flex items-center justify-center text-[#64748b] text-center font-mono">
              [ SELECT ANY DRONE FROM THE MATRIX OR RADAR TO INSPECT TELEMETRY ]
            </div>
          )}
        </section>
      </div>

      {/* Reject Modal Prompt */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0b1120] border border-[#ef4444] p-4 max-w-md w-full font-mono text-xs space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#ef4444]/30 pb-1.5">
              <span className="font-bold text-[#f87171] flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />
                [ REJECT SUGGESTED FIX — MANDATORY REASON ]
              </span>
              <button onClick={() => setShowRejectModal(false)} className="text-[#94a3b8] hover:text-[#f1f5f9]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[#cbd5e1] text-[11px]">
              Provide a reason for rejecting the automated trajectory fix for <strong>{selectedFault?.drone_id}</strong>:
            </p>

            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-[#070b14] border border-[#1e2d4a] text-[#f1f5f9] p-2 text-xs focus:outline-none focus:border-[#ef4444] font-mono"
              placeholder="e.g. Manual visual obstruction or wind gust"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1 bg-[#17233f] hover:bg-[#1f3056] active:bg-[#253966] text-[#cbd5e1] text-xs font-mono border border-[#1e2d4a]"
              >
                [ CANCEL ]
              </button>
              <button
                onClick={() => handleControllerAction("reject", { reason: rejectionReason })}
                className="px-3 py-1 bg-[#ef4444] hover:bg-[#f87171] active:bg-[#dc2626] text-[#ffffff] font-bold text-xs font-mono border border-[#ef4444]"
              >
                [ CONFIRM REJECT ]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal Prompt */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0b1120] border border-[#f59e0b] p-4 max-w-md w-full font-mono text-xs space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#f59e0b]/30 pb-1.5">
              <span className="font-bold text-[#fbbf24] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#f59e0b]" />
                [ MANUAL CONTROLLER OVERRIDE (O) ]
              </span>
              <button onClick={() => setShowOverrideModal(false)} className="text-[#94a3b8] hover:text-[#f1f5f9]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[#cbd5e1] text-[11px]">
              Record controller manual override notes for <strong>{selectedFault?.drone_id}</strong>:
            </p>

            <input
              type="text"
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              className="w-full bg-[#070b14] border border-[#1e2d4a] text-[#f1f5f9] p-2 text-xs focus:outline-none focus:border-[#f59e0b] font-mono"
              placeholder="e.g. Controller manual stick override executed"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-3 py-1 bg-[#17233f] hover:bg-[#1f3056] active:bg-[#253966] text-[#cbd5e1] text-xs font-mono border border-[#1e2d4a]"
              >
                [ CANCEL ]
              </button>
              <button
                onClick={() => handleControllerAction("override", { notes: overrideNotes })}
                className="px-3 py-1 bg-[#f59e0b] hover:bg-[#fbbf24] active:bg-[#d97706] text-[#050811] font-bold text-xs font-mono border border-[#f59e0b]"
              >
                [ CONFIRM OVERRIDE ]
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
