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
      className="relative w-full h-full min-h-0 bg-[#070b14] border border-[#1e2d4a] rounded overflow-hidden flex items-center justify-center font-mono select-none"
    >
      {/* HUD Radial Overlays */}
      <svg viewBox="0 0 600 600" className="w-full h-full max-h-full object-contain">
        {/* Background Radial Glow */}
        <defs>
          <radialGradient id="radarGridGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#101a33" stopOpacity="0.75" />
            <stop offset="85%" stopColor="#070b14" stopOpacity="0.98" />
          </radialGradient>
          <filter id="limeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
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
                stroke="#172440"
                strokeWidth="1"
                strokeDasharray={radiusM % 10 === 0 ? "4 4" : "2 6"}
              />
              <text
                x={centerX + rPx + 4}
                y={centerY - 4}
                fill="#475569"
                fontSize="9"
                fontFamily="monospace"
              >
                {radiusM}m
              </text>
            </g>
          );
        })}

        {/* Crosshair Axes */}
        <line x1="0" y1={centerY} x2="600" y2={centerY} stroke="#172440" strokeWidth="1" />
        <line x1={centerX} y1="0" x2={centerX} y2="600" stroke="#172440" strokeWidth="1" />

        {/* Landing Zones */}
        {/* LZ-ALPHA (Center) */}
        <g>
          <circle
            cx={toSvgX(0)}
            cy={toSvgY(0)}
            r={18}
            fill="rgba(34, 197, 94, 0.08)"
            stroke="#22c55e"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={toSvgX(0)}
            y={toSvgY(0) + 3}
            textAnchor="middle"
            fill="#4ade80"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            LZ-A
          </text>
        </g>

        {/* LZ-PERIMETER (24m, 24m) */}
        <g>
          <circle
            cx={toSvgX(24)}
            cy={toSvgY(24)}
            r={20}
            fill="rgba(245, 158, 11, 0.08)"
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
            fontFamily="monospace"
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
              stroke="#22c55e"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              filter="url(#limeGlow)"
            />
            {/* Draw Waypoint Markers */}
            {previewFix.waypoints.map((wp, idx) => (
              <circle
                key={idx}
                cx={toSvgX(wp.x)}
                cy={toSvgY(wp.y)}
                r={idx === 0 || idx === previewFix.waypoints.length - 1 ? 5 : 3.5}
                fill={idx === previewFix.waypoints.length - 1 ? "#22c55e" : "#86efac"}
                stroke="#070b14"
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

          // Dark Navy / Lime-Green Terminal Status Palette
          const color = isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e";
          const glowColor = isCritical ? "#450a0a" : isWarning ? "#451a03" : "#052e16";

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
                  stroke={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e"}
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
                  stroke="#22c55e"
                  strokeWidth="1.8"
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
                fill={isSelected ? "#4ade80" : "#cbd5e1"}
                fontSize="9"
                fontWeight={isSelected ? "bold" : "normal"}
                fontFamily="monospace"
                className="pointer-events-none"
              >
                {d.drone_id.replace("DRONE-", "D")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Radar Overlay Controls Badge */}
      <div className="absolute top-2 left-2 bg-[#0b1120] border border-[#1e2d4a] px-2 py-0.5 text-[10px] text-slate-300 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#22c55e] animate-pulse" />
          <span className="text-[#4ade80] font-bold">[ SPATIAL RADAR • 50m CEILING ]</span>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 bg-[#0b1120] border border-[#1e2d4a] px-2 py-0.5 text-[9px] text-[#64748b] font-mono">
        [ GRID: 5m CONCENTRIC • TAP DRONE ]
      </div>
    </div>
  );
};
