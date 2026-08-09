# OmniMonitor

> **Real-time drone show monitoring, fault detection, and human-in-the-loop controller interface.**

OmniMonitor sits between show-design platforms (**Skybrush**, **Verge Aero**, **Vimdrones Designer**) and live drone fleets. It continuously ingests high-frequency telemetry, cross-checks real-time positions against intended choreography, computes safety health scores, classifies anomalies, and provides human operators with an instant review-and-approval control surface for fleet re-planning actions.

---

## Standing Rules & Safety Gates

This codebase strictly adheres to the following safety and architectural constraints:

1. **No Silent Database Changes:** Supabase database schema and RLS policies are **proposed as migrations/diffs for human review** and are never auto-applied without approval.
2. **Controller Approval Gate:** Never auto-dispatch re-planning actions (reroute, land, swap) to real or simulated drones without passing through the controller interface's approval flow first, with the sole exception of pre-approved position drift auto-correction.
3. **Intentional Human-Made Visual Identity:**
   - No purple/cyan gradients.
   - No sparkle icons or generic "AI-generated" visual tropes.
   - No fabricated stats or fake metrics. Empty states honestly state `no data yet`.
   - Professional mission-control look with high legibility and contrast.
4. **Section-Gated Execution:** Full compliance with all sections 1 through 7.
5. **Safety-Adjacent Logging:** Never silently swallow a fault or error — every failure mode surfaces visibly in logs and the operator interface.

---

## Development Roadmap & Status

- [x] **Section 1: Scaffold & Schema Proposal** — Next.js 16 App Router setup, Tailwind CSS 4 mission control skin, domain types, and unapplied Supabase schema draft.
- [x] **Section 2: Simulated Fleet & Telemetry Ingestion** — 12-drone 5Hz kinematic simulator with LiPo discharge curve, 4-point motor thermal dynamics, IMU attitude, RF packet loss, dynamic fault injection, and ring buffer receiver.
- [x] **Section 3: Show-Plan Adapters** — Skybrush (`.skyc` ZIP & JSON), Vimdrones (Blender export script + parser), and Verge Aero (stub) normalized parser pipeline.
- [x] **Section 4: Sync & Monitoring Engine** — 3D Catmull-Rom/linear trajectory interpolation, weighted composite health score (0-100), and stale telemetry detection.
- [x] **Section 5: Rule-Based Anomaly Detection** — Tunable debounce threshold classification (2 consecutive readings) with zero false positives.
- [x] **Section 6: Re-Planning Engine** — 4D collision-checked suggested fixes (`auto_correct`, `reroute_to_land` with perimeter detours, `hold_or_rth` climb above swarm ceiling).
- [x] **Section 7: Controller Interface** — Zero-scroll single-display mission control cockpit, 2D/3D spatial formation radar, keyboard approvals (`[Y]` / `[N]` / `[O]`), deep telemetry drawer, and CSV/JSON session audit exports.

---

## Getting Started

### Prerequisites
- Node.js `>= 20` (Node 24+ recommended)
- npm `>= 10`

### Installation & Run

```bash
# Install dependencies
npm install

# Run the local development server
npm run dev

# Run type check and lint
npm run typecheck
npm run lint
```

### Automated Verification Test Suites

```bash
npx tsx scripts/test-section2.ts  # Ingestion & Simulator tests
npx tsx scripts/test-section3.ts  # Show Plan Adapter tests
npx tsx scripts/test-section4.ts  # Time-Sync & Health Engine tests
npx tsx scripts/test-section5.ts  # Anomaly Detection tests
npx tsx scripts/test-section6.ts  # Re-Planning Engine tests
npx tsx scripts/test-section7.ts  # Controller Interface & Audit tests
```

Open [http://localhost:3000](http://localhost:3000) to view the live mission-control dashboard.
