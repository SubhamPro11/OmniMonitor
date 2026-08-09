import { NextRequest, NextResponse } from "next/server";
import { ShowPlanImporter, AdapterSource } from "@/lib/adapters";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let rawContent: string | Record<string, unknown> = "";
    let sourceHint: AdapterSource = "auto";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const hint = (formData.get("source") as AdapterSource) || "auto";
      if (!file) {
        return NextResponse.json({ error: "No show file uploaded" }, { status: 400 });
      }
      rawContent = await file.text();
      sourceHint = hint;
    } else {
      const body = await req.json();
      if (body.sample) {
        // Load from sample_shows folder
        const samplePath = path.join(process.cwd(), "sample_shows", body.sample);
        rawContent = await fs.readFile(samplePath, "utf-8");
        sourceHint = (body.source as AdapterSource) || "auto";
      } else {
        rawContent = body.content || body;
        sourceHint = body.source || "auto";
      }
    }

    const { plan, sanity } = ShowPlanImporter.parseShow(rawContent, sourceHint);

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        name: plan.name,
        source_tool: plan.source_tool,
        duration_ms: plan.duration_ms,
        drone_count: plan.drone_count,
        altitude_range: plan.altitude_range,
        spatial_bounds: plan.spatial_bounds,
        drones: plan.drones,
        total_waypoints: plan.all_waypoints.length,
        is_verified: plan.is_verified,
        metadata: plan.metadata,
      },
      sanity,
      sampleWaypoints: plan.all_waypoints.slice(0, 15),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Show import failed: ${String(err)}`,
      },
      { status: 400 }
    );
  }
}
