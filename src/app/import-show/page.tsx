"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Info,
  Compass,
} from "lucide-react";
import { ShowPlanSanityReport } from "@/types/showPlan";
import { ShowWaypoint } from "@/types/database";

interface ImportedShowSummary {
  id: string;
  name: string;
  source_tool: string;
  duration_ms: number;
  drone_count: number;
  altitude_range: { min_m: number; max_m: number };
  spatial_bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    min_z: number;
    max_z: number;
  };
  drones: string[];
  total_waypoints: number;
  is_verified?: boolean;
}

export default function ImportShowPage() {
  const [selectedSource, setSelectedSource] = useState<string>("auto");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<{
    plan: ImportedShowSummary;
    sanity: ShowPlanSanityReport;
    sampleWaypoints: ShowWaypoint[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load sample show directly
  async function loadSampleShow(filename: string, source: string) {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // In production/dev, fetch from public or API
      const res = await fetch(`/sample-files/${filename}`);
      let contentText = "";
      if (res.ok) {
        contentText = await res.text();
      } else {
        // Fallback: direct server import helper
        const fallbackRes = await fetch("/api/shows/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sample: filename, source }),
        });
        const fallbackData = await fallbackRes.json();
        if (!fallbackData.success) throw new Error(fallbackData.error);
        setImportResult(fallbackData);
        setIsProcessing(false);
        return;
      }

      const importRes = await fetch("/api/shows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentText, source }),
      });

      const data = await importRes.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      setImportResult(data);
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsProcessing(false);
    }
  }

  // Handle local file selection
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      const res = await fetch("/api/shows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, source: selectedSource }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error);
      }

      setImportResult(data);
    } catch (err) {
      setErrorMessage(`Upload parsing failed: ${String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#1e1e1e] text-[#f0f6fc] p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
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
              <FileCode className="w-5 h-5 text-[#4ade80]" />
              Show-Plan Importer & Sanity Verification
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#22c55e]/10 text-[#4ade80] border border-[#22c55e]/30">
                SECTION 3
              </span>
            </h1>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Normalizing intended choreography from Skybrush, Vimdrones Designer (Blender), and Verge Aero into a uniform trajectory model.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/test-telemetry"
            className="px-3 py-1.5 bg-[#10192e] hover:bg-[#17233f] text-[#f1f5f9] text-xs font-mono rounded border border-[#1e2d4a] transition-colors"
          >
            Live Telemetry View →
          </Link>
        </div>
      </header>

      {/* Main Grid: Upload Controls & Sanity Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Import Controls & Sample Pickers */}
        <div className="space-y-6">
          {/* Sample Show Files Card */}
          <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-5">
            <h2 className="text-xs font-mono uppercase font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Select Sample Show File
            </h2>

            <div className="space-y-2.5">
              <button
                onClick={() => loadSampleShow("skybrush_sample.skyc", "skybrush")}
                disabled={isProcessing}
                className="w-full text-left p-3 rounded bg-[#060911] border border-[#1e2c4a] hover:border-amber-500/50 transition-colors group flex items-start justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-200 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Skybrush Starlight Vortex
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    skybrush_sample.skyc (12 Drones, 60s)
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors mt-1" />
              </button>

              <button
                onClick={() => loadSampleShow("vimdrones_sample.json", "vimdrones")}
                disabled={isProcessing}
                className="w-full text-left p-3 rounded bg-[#060911] border border-[#1e2c4a] hover:border-amber-500/50 transition-colors group flex items-start justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-200 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
                    Vimdrones Blender Helix
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    vimdrones_sample.json (12 Drones, 60s)
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors mt-1" />
              </button>

              <button
                onClick={() => loadSampleShow("verge_aero_mock.json", "verge_aero")}
                disabled={isProcessing}
                className="w-full text-left p-3 rounded bg-amber-950/10 border border-amber-900/40 hover:border-amber-500/60 transition-colors group flex items-start justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-amber-300 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Verge Aero Mock Stub (UNVERIFIED)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    verge_aero_mock.json (Proprietary mock)
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors mt-1" />
              </button>
            </div>
          </section>

          {/* Custom File Upload Card */}
          <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-5">
            <h2 className="text-xs font-mono uppercase font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-amber-400" />
              Upload Custom Show File
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Source Tool Detection
                </label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full bg-[#060911] border border-[#1e2c4a] text-slate-200 text-xs font-mono p-2 rounded focus:outline-none focus:border-amber-400"
                >
                  <option value="auto">Auto-detect (.skyc / .json / blender)</option>
                  <option value="skybrush">Skybrush (.skyc)</option>
                  <option value="vimdrones">Vimdrones Designer (Blender export)</option>
                  <option value="verge_aero">Verge Aero (Stub)</option>
                </select>
              </div>

              <div className="border-2 border-dashed border-[#1e2c4a] hover:border-amber-500/50 p-6 rounded-lg text-center cursor-pointer transition-colors relative bg-[#060911]">
                <input
                  type="file"
                  accept=".skyc,.json,.csv,.txt"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <div className="text-xs font-mono text-slate-300 font-semibold">
                  Click or drag show file to import
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-1">
                  Supports .skyc (Skybrush), .json (Vimdrones), or mock files
                </div>
              </div>
            </div>
          </section>

          {/* Error Message Notice */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono rounded flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <div className="font-semibold">Import Error</div>
                <div>{errorMessage}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Sanity-Check Summary & Waypoints Table */}
        <div className="lg:col-span-2 space-y-6">
          {importResult ? (
            <>
              {/* Sanity Check Overview Card */}
              <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-5">
                <div className="flex items-center justify-between border-b border-[#1e2c4a] pb-3 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-100 font-mono">
                      {importResult.plan.name}
                    </h2>
                    <div className="text-xs font-mono text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>SOURCE: <strong className="text-slate-200 uppercase">{importResult.plan.source_tool}</strong></span>
                      <span>•</span>
                      <span>ID: <code className="text-slate-400">{importResult.plan.id}</code></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {importResult.sanity.is_valid ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        SANITY: PASSED
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        SANITY: ERRORS
                      </span>
                    )}

                    {importResult.plan.is_verified === false && (
                      <span className="px-2 py-1 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[11px] font-mono">
                        UNVERIFIED STUB
                      </span>
                    )}
                  </div>
                </div>

                {/* 4 Metric Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">Drone Count</div>
                    <div className="text-xl font-bold text-slate-100 mt-0.5">
                      {importResult.plan.drone_count} <span className="text-xs text-slate-500 font-normal">fleet</span>
                    </div>
                  </div>

                  <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">Show Duration</div>
                    <div className="text-xl font-bold text-amber-400 mt-0.5">
                      {(importResult.plan.duration_ms / 1000).toFixed(1)}s
                    </div>
                  </div>

                  <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">Altitude Range</div>
                    <div className="text-xl font-bold text-slate-100 mt-0.5">
                      {importResult.plan.altitude_range.min_m}m - {importResult.plan.altitude_range.max_m}m
                    </div>
                  </div>

                  <div className="bg-[#060911] border border-[#1e2c4a] p-3 rounded">
                    <div className="text-[10px] text-slate-400 uppercase">Total Waypoints</div>
                    <div className="text-xl font-bold text-emerald-400 mt-0.5">
                      {importResult.plan.total_waypoints.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Spatial Bounds Box */}
                <div className="mt-4 p-3 bg-[#060911] border border-[#1e2c4a] rounded text-xs font-mono">
                  <div className="text-slate-400 uppercase text-[10px] mb-1 font-semibold flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-slate-400" />
                    Spatial Bounding Envelope (Relative Coordinates in Meters)
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-slate-300">
                    <div>X: [{importResult.plan.spatial_bounds.min_x}m, {importResult.plan.spatial_bounds.max_x}m]</div>
                    <div>Y: [{importResult.plan.spatial_bounds.min_y}m, {importResult.plan.spatial_bounds.max_y}m]</div>
                    <div>Z (Alt): [{importResult.plan.spatial_bounds.min_z}m, {importResult.plan.spatial_bounds.max_z}m]</div>
                  </div>
                </div>

                {/* Warnings or Notices */}
                {importResult.sanity.warnings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {importResult.sanity.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="p-2 bg-amber-950/20 border border-amber-800/40 text-amber-300 text-xs font-mono rounded flex items-center gap-2"
                      >
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Waypoint Sample Inspection Table */}
              <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg overflow-hidden flex flex-col">
                <div className="p-3 border-b border-[#1e2c4a] flex items-center justify-between bg-[#080d1a]">
                  <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider">
                    Parsed Waypoint Inspection (Normalized Schema Sample)
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Displaying first {importResult.sampleWaypoints.length} of {importResult.plan.total_waypoints} points
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1e2c4a] bg-[#060911] text-slate-400 text-[11px] uppercase">
                        <th className="py-2.5 px-3">Drone ID</th>
                        <th className="py-2.5 px-3">Timeline Offset</th>
                        <th className="py-2.5 px-3">Position (X, Y, Z)</th>
                        <th className="py-2.5 px-3">Altitude (m)</th>
                        <th className="py-2.5 px-3">LED RGB Color</th>
                        <th className="py-2.5 px-3">Brightness</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#152037]">
                      {importResult.sampleWaypoints.map((wp, idx) => {
                        const { r, g, b, brightness } = wp.led_state;
                        const rgbStyle = `rgb(${r}, ${g}, ${b})`;

                        return (
                          <tr key={idx} className="hover:bg-[#0d1424] transition-colors tabular-data">
                            <td className="py-2 px-3 font-semibold text-slate-200">{wp.drone_id}</td>
                            <td className="py-2 px-3 text-slate-400">
                              <span className="text-slate-200">{wp.t_offset_ms} ms</span>{" "}
                              <span className="text-slate-500 text-[10px]">({(wp.t_offset_ms / 1000).toFixed(1)}s)</span>
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              [{wp.position.x}, {wp.position.y}, {wp.position.z}] m
                            </td>
                            <td className="py-2 px-3 text-amber-400 font-semibold">
                              {wp.position.alt_m?.toFixed(2) ?? wp.position.z} m
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3.5 h-3.5 rounded border border-slate-700 inline-block shadow-sm"
                                  style={{ backgroundColor: rgbStyle }}
                                />
                                <span className="text-slate-300 text-[11px]">
                                  rgb({r}, {g}, {b})
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-400">{brightness ?? 100}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            /* Empty State: No Show Imported Yet */
            <section className="bg-[#0a0f1d] border border-[#1e2c4a] rounded-lg p-12 text-center">
              <FileCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-mono font-semibold text-slate-300">
                no data yet — no show plan imported
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Select one of the sample show choreographies on the left or upload a .skyc / .json export to inspect the normalized waypoint schema.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => loadSampleShow("skybrush_sample.skyc", "skybrush")}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-700 transition-colors"
                >
                  Load Skybrush Sample (.skyc)
                </button>
                <button
                  onClick={() => loadSampleShow("vimdrones_sample.json", "vimdrones")}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-700 transition-colors"
                >
                  Load Vimdrones Blender Sample
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1e2c4a] pt-4 text-xs font-mono text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>OMNIMONITOR SHOW-PLAN ADAPTER ENGINE (SECTION 3)</div>
        <div>NORMALIZED SCHEMA READY FOR SECTION 4 INTENDED-VS-ACTUAL SYNC</div>
      </footer>
    </main>
  );
}
