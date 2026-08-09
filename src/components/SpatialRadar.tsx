"use client";

import React, { useRef } from "react";
import { DroneHealthBreakdown } from "@/types/health";
import { SuggestedFix } from "@/types/replanning";

interface SpatialRadarProps {
  drones: DroneHealthBreakdown[];
  selectedDroneId: string | null;
  onSelectDrone: (droneId: string) => void;
  previewFix: SuggestedFix | null;
}

export const SpatialRadar: React.FC<SpatialRadarProps> = ({
  drones,
  selectedDroneId,
  onSelectDrone,
  previewFix,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Map spatial coordinates (meters: -30m to +30m) to SVG Canvas (0 to 600)
  const mapScale = 600 / 60; // 10 pixels per meter
  const centerX = 300;
  const centerY = 300;

  function toSvgX(meterX: number): number {
    return centerX + meterX * (mapScale * 0.9);
  }

  function toSvgY(meterY: number): number {
    return centerY - meterY * (mapScale * 0.9);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 bg-[#050810] border border-[#1e2c4a] rounded-lg overflow-hidden flex items-center justify-center font-mono select-none"
    >
      {/* HUD Radial Overlays */}
      <svg viewBox="0 0 600 600" className="w-full h-full max-h-full object-contain">
        {/* Background Grid Lines */}
        <defs>
          <radialGradient id="radarGridGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f1f38" stopOpacity="0.6" />
            <stop offset="85%" stopColor="#050810" stopOpacity="0.95" />
          </radialGradient>
        </defs>

        <rect width="600" height="600" fill="url(#radarGridGlow)" />

        {/* Concentric Spatial Safety Rings (5m, 10m, 15m, 20m, 25m) */}
        {[5, 10, 15, 20, 25].map((radiusM) => {
          const rPx = radiusM * (mapScale * 0.9);
          return (
            <g key={radiusM}>
              <circle
                cx={centerX}
                cy={centerY}
                r={rPx}
                fill="none"
                stroke="#172642"
                strokeWidth="1"
                strokeDasharray={radiusM % 10 === 0 ? "4 4" : "2 6"}
              />
              <text
                x={centerX + rPx + 4}
                y={centerY - 4}
                fill="#3b5278"
                fontSize="9"
                fontFamily="monospace"
              >
                {radiusM}m
              </text>
            </g>
          );
        })}

        {/* Crosshair Axes */}
        <line x1="0" y1={centerY} x2="600" y2={centerY} stroke="#172642" strokeWidth="1" />
        <line x1={centerX} y1="0" x2={centerX} y2="600" stroke="#172642" strokeWidth="1" />

        {/* Landing Zones */}
        {/* LZ-ALPHA (Center) */}
        <g>
          <circle
            cx={toSvgX(0)}
            cy={toSvgY(0)}
            r={18}
            fill="#06221d"
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={toSvgX(0)}
            y={toSvgY(0) + 3}
            textAnchor="middle"
            fill="#34d399"
            fontSize="9"
            fontWeight="bold"
          >
            LZ-A
          </text>
        </g>

        {/* LZ-PERIMETER (25m, 25m) */}
        <g>
          <circle
            cx={toSvgX(24)}
            cy={toSvgY(24)}
            r={20}
            fill="#1c1608"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={toSvgX(24)}
            y={toSvgY(24) + 3}
            textAnchor="middle"
            fill="#fbbf24"
            fontSize="9"
            fontWeight="bold"
          >
            LZ-P
          </text>
        </g>

        {/* Suggested Fix Trajectory Preview Overlay */}
        {previewFix && previewFix.waypoints && previewFix.waypoints.length >= 2 && (
          <g>
            {/* Draw Path Lines */}
            <polyline
              points={previewFix.waypoints
                .map((wp) => `${toSvgX(wp.x)},${toSvgY(wp.y)}`)
                .join(" ")}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="4 4"
            />
            {/* Draw Waypoint Markers */}
            {previewFix.waypoints.map((wp, idx) => (
              <circle
                key={idx}
                cx={toSvgX(wp.x)}
                cy={toSvgY(wp.y)}
                r={idx === 0 || idx === previewFix.waypoints.length - 1 ? 5 : 3.5}
                fill={idx === previewFix.waypoints.length - 1 ? "#10b981" : "#38bdf8"}
                stroke="#060911"
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}

        {/* Drones Rendering */}
        {drones.map((d) => {
          const isSelected = d.drone_id === selectedDroneId;
          const isCritical = d.tier === "critical";
          const isWarning = d.tier === "warning";

          const actX = toSvgX(d.actual_position?.x ?? 0);
          const actY = toSvgY(d.actual_position?.y ?? 0);

          let intX = actX;
          let intY = actY;
          if (d.intended_position) {
            intX = toSvgX(d.intended_position.x ?? 0);
            intY = toSvgY(d.intended_position.y ?? 0);
          }

          // Color definition
          const color = isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981";
          const glowColor = isCritical ? "#7f1d1d" : isWarning ? "#78350f" : "#064e3b";

          return (
            <g
              key={d.drone_id}
              onClick={() => onSelectDrone(d.drone_id)}
              className="cursor-pointer transition-transform duration-200"
            >
              {/* Intended Position Ghost Circle */}
              {d.intended_position && (
                <circle
                  cx={intX}
                  cy={intY}
                  r="4"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}

              {/* Drift Vector Line */}
              {d.intended_position && d.position_delta_m > 0.3 && (
                <line
                  x1={actX}
                  y1={actY}
                  x2={intX}
                  y2={intY}
                  stroke={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#64748b"}
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />
              )}

              {/* Active Selection Ring */}
              {isSelected && (
                <circle
                  cx={actX}
                  cy={actY}
                  r="14"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
              )}

              {/* Actual Drone Position */}
              <circle
                cx={actX}
                cy={actY}
                r={isSelected ? "7" : "5.5"}
                fill={color}
                stroke={glowColor}
                strokeWidth="2"
              />

              {/* Drone ID Label */}
              <text
                x={actX}
                y={actY - 9}
                textAnchor="middle"
                fill={isSelected ? "#38bdf8" : "#cbd5e1"}
                fontSize="9"
                fontWeight={isSelected ? "bold" : "normal"}
                className="pointer-events-none"
              >
                {d.drone_id.replace("DRONE-", "D")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Radar Overlay Controls Badge */}
      <div className="absolute top-2 left-2 bg-[#060911]/90 border border-[#1e2c4a] px-2.5 py-1 rounded text-[10px] text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SPATIAL RADAR (50m SWARM CEILING)</span>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 bg-[#060911]/90 border border-[#1e2c4a] px-2 py-0.5 rounded text-[9px] text-slate-500 font-mono">
        GRID: 5m CONCENTRIC • TAP DRONE TO INSPECT
      </div>
    </div>
  );
};
