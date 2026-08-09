-- ==============================================================================
-- PROPOSED SUPABASE SCHEMA FOR OMNIMONITOR (v1 - DRAFT FOR REVIEW)
-- ==============================================================================
-- NOTE: DO NOT APPLY DIRECTLY. This file serves as an unapplied migration proposal
-- adhering to Section 0 Standing Rule #1 (Explicit review required for schema changes).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DRONES TABLE (Fleet Registry)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drones (
    id TEXT PRIMARY KEY,                       -- Hardware ID or Sim ID (e.g. 'DRONE-01')
    label TEXT NOT NULL,                       -- Human readable callsign (e.g. 'Alpha 1')
    status TEXT NOT NULL DEFAULT 'idle'        -- 'idle' | 'in_flight' | 'fault' | 'landed' | 'offline'
        CHECK (status IN ('idle', 'in_flight', 'fault', 'landed', 'offline')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drones_status ON public.drones(status);
CREATE INDEX IF NOT EXISTS idx_drones_last_seen ON public.drones(last_seen_at);

-- ------------------------------------------------------------------------------
-- 2. SHOWS TABLE (Imported Choreography Header)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    source_tool TEXT NOT NULL                  -- 'skybrush' | 'verge_aero' | 'vimdrones'
        CHECK (source_tool IN ('skybrush', 'verge_aero', 'vimdrones')),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    drone_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_shows_imported ON public.shows(imported_at DESC);

-- ------------------------------------------------------------------------------
-- 3. SHOW WAYPOINTS TABLE (Intended Drone Trajectories)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.show_waypoints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
    drone_id TEXT NOT NULL,
    t_offset_ms INTEGER NOT NULL,              -- Offset from show start in milliseconds
    position JSONB NOT NULL,                   -- { "x": 0.0, "y": 0.0, "z": 10.0, "lat": ..., "lon": ... }
    led_state JSONB NOT NULL DEFAULT '{}'::jsonb -- { "r": 255, "g": 255, "b": 255, "brightness": 100 }
);

CREATE INDEX IF NOT EXISTS idx_waypoints_show_drone_time 
    ON public.show_waypoints(show_id, drone_id, t_offset_ms);

-- ------------------------------------------------------------------------------
-- 4. TELEMETRY EVENTS TABLE (High-Write Frequency Ingestion)
-- ------------------------------------------------------------------------------
-- ARCHITECTURAL FLAG: At ~5Hz per drone (e.g., 50-500 drones = 250-2500 writes/sec),
-- this table will become a bottleneck in raw Postgres without write batching.
-- For production scale, recommend moving to a dedicated time-series store (TimescaleDB / ClickHouse)
-- or Postgres table partitioning by date/show. Kept lightweight for early prototyping.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drone_id TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    position JSONB NOT NULL,                   -- { "lat": 37.77, "lon": -122.41, "alt_m": 45.2, "x": 1.2, "y": 3.4, "z": 45.2 }
    velocity JSONB NOT NULL,                   -- { "x": 0.1, "y": -0.2, "z": 0.0 } (m/s)
    battery JSONB NOT NULL,                    -- { "voltage": 16.2, "current_a": 12.4, "pct": 84 }
    imu JSONB NOT NULL,                        -- { "pitch": 0.2, "roll": -0.1, "yaw": 182.4 } (deg)
    link_quality JSONB NOT NULL,               -- { "rssi_dbm": -68, "packet_loss_pct": 0.0 }
    motor_temp NUMERIC[] NOT NULL,             -- Array of motor temps in C, e.g. ARRAY[45.1, 46.0, 44.8, 45.5]
    gps_fix TEXT NOT NULL DEFAULT '3D_FIX',    -- 'NO_FIX' | '3D_FIX' | 'RTK_FLOAT' | 'RTK_FIXED'
    flight_mode TEXT NOT NULL DEFAULT 'SHOW'   -- 'SHOW' | 'MANUAL' | 'HOLD' | 'LAND' | 'RTH'
);

CREATE INDEX IF NOT EXISTS idx_telemetry_drone_ts ON public.telemetry_events(drone_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON public.telemetry_events(ts DESC);

-- ------------------------------------------------------------------------------
-- 5. FAULT EVENTS TABLE (Safety, Anomaly & Controller Decision Registry)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fault_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drone_id TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fault_type TEXT NOT NULL,                  -- 'position_drift' | 'battery_critical' | 'motor_critical' | 'comms_loss' | etc.
    severity TEXT NOT NULL                     -- 'info' | 'warning' | 'critical'
        CHECK (severity IN ('info', 'warning', 'critical')),
    delta JSONB NOT NULL,                      -- { "metric": "position_delta_m", "value": 2.4, "threshold": 1.5 }
    suggested_fix JSONB,                       -- { "action": "auto_correct" | "reroute_to_land", "collision_checked": true, ... }
    status TEXT NOT NULL DEFAULT 'pending'     -- 'pending' | 'approved' | 'rejected' | 'auto_applied'
        CHECK (status IN ('pending', 'approved', 'rejected', 'auto_applied')),
    resolved_at TIMESTAMPTZ,
    rejection_reason TEXT                      -- Required when operator rejects a safety suggestion
);

CREATE INDEX IF NOT EXISTS idx_fault_events_status ON public.fault_events(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fault_events_drone ON public.fault_events(drone_id, detected_at DESC);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES SKETCH
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.drones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fault_events ENABLE ROW LEVEL SECURITY;

-- 6.1 Drones & Shows RLS
-- Operators and viewers can read fleet registry and shows
CREATE POLICY "Allow authenticated read on drones"
    ON public.drones FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow service role write on drones"
    ON public.drones FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated read on shows"
    ON public.shows FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated read on show_waypoints"
    ON public.show_waypoints FOR SELECT
    TO authenticated
    USING (true);

-- 6.2 Telemetry Events RLS
-- Operators can read live and historical telemetry
CREATE POLICY "Allow authenticated read on telemetry"
    ON public.telemetry_events FOR SELECT
    TO authenticated
    USING (true);

-- Ingestion pipeline (simulator / edge gateway) writes via service role or dedicated ingest token
CREATE POLICY "Allow ingest write on telemetry"
    ON public.telemetry_events FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 6.3 Fault Events RLS
-- Operators can view all fault events
CREATE POLICY "Allow authenticated read on fault_events"
    ON public.fault_events FOR SELECT
    TO authenticated
    USING (true);

-- Backend monitoring engine creates fault events
CREATE POLICY "Allow monitoring engine create fault_events"
    ON public.fault_events FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Controller human-in-the-loop operators can update status (Approve / Reject)
CREATE POLICY "Allow operators to approve or reject fault_events"
    ON public.fault_events FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (
        -- Enforce that operators provide a rejection reason when rejecting
        (status != 'rejected') OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
    );
