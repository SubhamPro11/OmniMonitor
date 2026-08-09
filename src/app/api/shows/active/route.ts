import { NextResponse } from "next/server";
import { ShowPlanImporter } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET() {
  const activePlan = ShowPlanImporter.getActivePlan();
  if (!activePlan) {
    return NextResponse.json({
      hasActivePlan: false,
      message: "No show plan currently loaded in memory.",
    });
  }

  return NextResponse.json({
    hasActivePlan: true,
    plan: {
      id: activePlan.id,
      name: activePlan.name,
      source_tool: activePlan.source_tool,
      duration_ms: activePlan.duration_ms,
      drone_count: activePlan.drone_count,
      altitude_range: activePlan.altitude_range,
      spatial_bounds: activePlan.spatial_bounds,
      drones: activePlan.drones,
      total_waypoints: activePlan.all_waypoints.length,
      imported_at: activePlan.imported_at,
      is_verified: activePlan.is_verified,
    },
  });
}
