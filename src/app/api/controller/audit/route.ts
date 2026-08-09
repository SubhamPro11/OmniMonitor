import { NextRequest, NextResponse } from "next/server";
import { getGlobalAuditLog } from "@/lib/controller/auditLog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auditLog = getGlobalAuditLog();
  const format = req.nextUrl.searchParams.get("format");

  if (format === "csv") {
    const csvContent = auditLog.exportCSV();
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="omnimonitor_mission_audit.csv"',
      },
    });
  }

  if (format === "json_download") {
    const jsonContent = auditLog.exportJSON();
    return new NextResponse(jsonContent, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="omnimonitor_mission_audit.json"',
      },
    });
  }

  return NextResponse.json({
    total_decisions: auditLog.getHistory().length,
    entries: auditLog.getHistory(),
  });
}
