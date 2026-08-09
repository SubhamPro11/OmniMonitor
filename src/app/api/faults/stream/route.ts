import { NextResponse } from "next/server";
import { getGlobalFaultEventBus } from "@/lib/faults/eventBus";
import { getGlobalSessionLedger, mapPayloadToCockpitEvent } from "@/lib/faults/cockpitAdapter";
import { FaultEventPayload } from "@/types/faults";

export const dynamic = "force-dynamic";

// Static mock/sample stream events illustrating the contract across all categories
export const SAMPLE_FAULT_STREAM_CONTRACT: FaultEventPayload[] = [
  {
    id: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
    drone_id: "DRONE-02",
    timestamp: new Date().toISOString(),
    category: "positional",
    fault_type: "POSITION_DRIFT_CRIT",
    severity: "critical",
    trigger_mode: "sustained",
    triggering_metrics: {
      name: "position_delta_3d",
      observed_value: 2.85,
      threshold_value: 2.5,
      unit: "m",
    },
    consecutive_breaches: 2,
    description: "Severe 3D position drift of 2.85m (threshold: 2.5m)",
    status: "pending",
  },
  {
    id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    drone_id: "DRONE-05",
    timestamp: new Date().toISOString(),
    category: "battery",
    fault_type: "BATTERY_SOC_WARN",
    severity: "warning",
    trigger_mode: "sustained",
    triggering_metrics: {
      name: "battery_pct",
      observed_value: 18.2,
      threshold_value: 20.0,
      unit: "%",
    },
    consecutive_breaches: 4,
    description: "Low battery charge level at 18.2% (threshold: 20.0%)",
    status: "pending",
  },
  {
    id: "a3b12345-1234-5678-90ab-cdef12345678",
    drone_id: "DRONE-08",
    timestamp: new Date().toISOString(),
    category: "thermal",
    fault_type: "MOTOR_TEMP_CRIT",
    severity: "critical",
    trigger_mode: "sustained",
    triggering_metrics: {
      name: "motor_temp_max",
      observed_value: 84.6,
      threshold_value: 82.0,
      unit: "°C",
    },
    consecutive_breaches: 2,
    description: "Motor temperature critical: 84.6°C (threshold: 82.0°C)",
    status: "pending",
  },
  {
    id: "c4d56789-9876-5432-10fe-dcba98765432",
    drone_id: "SWARM",
    involved_drone_ids: ["DRONE-01", "DRONE-04"],
    timestamp: new Date().toISOString(),
    category: "swarm",
    fault_type: "COLLISION_PROXIMITY_CRIT",
    severity: "critical",
    trigger_mode: "instant",
    triggering_metrics: {
      name: "separation_distance_3d",
      observed_value: 0.95,
      threshold_value: 1.2,
      unit: "m",
    },
    consecutive_breaches: 1,
    description: "Emergency collision hazard: DRONE-01 and DRONE-04 separation closed to 0.95m (<= 1.2m)",
    status: "pending",
  },
];

export async function GET() {
  const eventBus = getGlobalFaultEventBus();
  const sessionLedger = getGlobalSessionLedger();

  const activeRaw = eventBus.getActivePendingFaults();
  const historyRaw = eventBus.getRecentEvents(50);
  const auditEntries = sessionLedger.getAuditRecords(50);

  // Map to cockpit UI compatible format
  const activeFaults = activeRaw.map(mapPayloadToCockpitEvent);
  const history = historyRaw.map(mapPayloadToCockpitEvent);

  return NextResponse.json({
    activeCount: activeFaults.length,
    activeFaults,
    history,
    auditTrail: auditEntries,
    contractSample: SAMPLE_FAULT_STREAM_CONTRACT.map(mapPayloadToCockpitEvent),
  });
}
