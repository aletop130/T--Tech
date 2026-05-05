# HORUS

**Space Domain Awareness Platform**

HORUS is a full-stack, web-native platform for space operations. It provides real-time orbital tracking, AI-assisted threat assessment, collision avoidance, space weather impact analysis, and multi-domain operational planning — all in a single deployable system.

The platform operates on public orbital data (CelesTrak) and live space weather feeds (NOAA SWPC), while being architecturally ready for higher-fidelity data sources without requiring structural changes.

---

## Core Capabilities

### Real-Time Orbital Picture
3D globe powered by CesiumJS with SGP4 propagation, orbital tracks, ground tracks, coverage footprints, conjunction overlays, signal paths, and tactical visualization layers. Operators can monitor the full orbital environment in real time.

### Collision Avoidance — Detour
End-to-end collision avoidance pipeline: conjunction screening, risk scoring, maneuver planning, approval gates, and execution support. AI-assisted workflows handle the computational burden while the operator retains authority over every consequential decision.

### Multi-Dimensional Threat Detection
Threat scoring that goes beyond proximity alone. The system combines orbital analysis, RF signals, anomaly detection, shadowing and loitering patterns, country priors, radar cross-section assumptions, and live space weather data into a Bayesian threat model.

### Space Weather Operations
Live ingestion from NOAA SWPC with service-differentiated impact scoring. Instead of just showing solar indices, HORUS translates geomagnetic and solar activity into actionable impact assessments for GNSS, RF communications, orbital drag, and radiation exposure.

### Multi-Domain Sandbox
Scenario planning environment supporting satellites, aircraft, ships, ground vehicles, and drones in a shared operational space. Operators can create scenarios, run what-if drills, import live entities, hand off from live tracking into simulation, and replay sessions through a timeline.

### Intelligence Workflows
Dedicated modules for threat detection, launch correlation, reentry monitoring, maneuver detection, country-level orbital ownership analysis, debris genealogy, and fleet risk heatmaps.

### RF Spectrum Monitoring
Transmitter and RF-oriented analysis with SatNOGS enrichment for signal tracking and spectrum awareness.

### AI-Assisted Decision Support
AI is integrated through a backend gateway with agent-based workflows for detection, response planning, Detour operations, and sandbox interaction. The system is human-supervised — AI handles computation and workflow coordination, operators make the calls.

### Italy Coverage Monitor
Dedicated view for monitoring Italian space dependencies, ground station coverage, and satellite connectivity relevant to national infrastructure.

---

## Platform Views

| View | Description |
|------|-------------|
| **Dashboard** | Operational snapshot with key metrics and alerts |
| **Map** | Live 3D orbital and tactical picture |
| **Sandbox** | Multi-domain scenario planning and wargaming |
| **Explorer** | Object catalog, network graph, country ownership |
| **Intelligence** | Detection, launches, reentry, maneuvers, adversary analysis |
| **RF Spectrum** | RF and transmitter monitoring |
| **Space Weather** | Live space weather with service impact scoring |
| **Italy** | National dependency and coverage monitoring |
| **Operations** | Incidents, Detour, routes, formations, communications |
| **System** | Service health, tenant settings, statistics |

---

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │            Frontend                   │
                    │  Next.js  ·  React  ·  TypeScript     │
                    │  CesiumJS  ·  Blueprint.js  ·  SWR    │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────┴───────────────────┐
                    │             Backend                   │
                    │  FastAPI  ·  Async  ·  WebSocket      │
                    │  AI Gateway  ·  Analytics             │
                    └───────┬──────────┬──────────┬────────┘
                            │          │          │
              ┌─────────────┴───┐ ┌────┴────┐ ┌──┴─────┐
              │  PostgreSQL 16  │ │  Redis  │ │  MinIO │
              │  + pgvector     │ │  Celery │ │  S3    │
              └─────────────────┘ └─────────┘ └────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 18, TypeScript |
| UI | Blueprint.js, Radix UI, Tailwind CSS |
| 3D Globe | CesiumJS + Resium |
| Orbit Propagation | satellite.js (frontend), sgp4 (backend) |
| Backend | FastAPI, Pydantic v2, SQLAlchemy async |
| Database | PostgreSQL 16 + pgvector |
| Queue | Redis, Celery worker + beat |
| Object Storage | MinIO |
| AI | Regolo.ai-compatible gateway |
| Testing | pytest, Vitest, Playwright |
| Deployment | Docker Compose |

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Optional: `REGOLO_API_KEY` for AI features
- Optional: provider keys for full data coverage (N2YO, Space-Track, Copernicus, ESA DISCOS, OpenSky, MyShipTracking) — see `.env.example`

### Setup

```bash
git clone https://github.com/aletop130/T--Tech.git horus
cd horus
cp .env.example .env       # edit .env to add API keys (all optional except SECRET_KEY in prod)
docker compose up -d
```

### Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Docs | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

---

## Repository Structure

```
backend/
  app/
    api/v1/         Route modules
    services/       Business logic
    db/             Models and sessions
    schemas/        Request/response schemas
    agents/         AI orchestration
    physics/        SGP4, orbital mechanics
  alembic/          Database migrations
  tests/

frontend/
  src/app/          Next.js App Router pages
  src/components/   Feature-oriented React components
  src/lib/          API clients, stores, utilities
  tests/

cloudflare-worker/  Edge routing
docs/               Technical documentation
```

---

## Data Sources

| Source | Usage |
|--------|-------|
| CelesTrak | Orbital data, object catalog, close-approach data |
| NOAA SWPC | Live space weather feeds |
| SatNOGS | RF and transmitter enrichment |

For full CelesTrak attribution see [CELESTRAK_ATTRIBUTION.md](./CELESTRAK_ATTRIBUTION.md).

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DETOUR_API.md](./docs/DETOUR_API.md)
- [CELESTRAK_ATTRIBUTION.md](./CELESTRAK_ATTRIBUTION.md)
