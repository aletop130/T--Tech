# Horus — System Architecture

## Overview

Horus is a Space Domain Awareness (SDA) platform for real-time monitoring, threat detection, and operational control of space assets. The system provides a 3D interactive globe with satellite tracking, collision avoidance, tactical simulation, intelligence analysis, and AI-driven decision support.

Production deployment: `horustechsystems.com` (via Cloudflare edge proxy).

---

## Infrastructure

Seven containerized services orchestrated with Docker Compose:

```
                   +----------------+
                   |  Cloudflare    |
                   |  Edge Proxy    |
                   +-------+--------+
                           |
              +------------+------------+
              |                         |
     +--------v--------+     +---------v--------+
     |    Frontend      |     |     Backend      |
     |  Next.js 16      |     |   FastAPI 0.109  |
     |  :3000           |     |   :8000          |
     +------------------+     +----+------+------+
                                   |      |
                    +--------------+      +-------------+
                    |                                    |
           +--------v--------+               +----------v---------+
           |   PostgreSQL    |               |       Redis        |
           |  16 + pgvector  |               |    7-alpine        |
           |  :5432          |               |    :6379           |
           +-----------------+               +----------+---------+
                                                        |
                                             +----------v---------+
                                             |   Celery Worker    |
                                             |   Celery Beat      |
                                             +--------------------+

           +-----------------+
           |     MinIO       |
           |  S3-compatible  |
           |  :9000 / :9001  |
           +-----------------+
```

| Service | Image | Purpose |
|---------|-------|---------|
| **postgres** | pgvector/pgvector:pg16 | Primary database with vector embeddings |
| **redis** | redis:7-alpine | Cache + Celery message broker |
| **minio** | minio/minio | S3-compatible object storage (ingestion files) |
| **backend** | Python 3.12 / FastAPI | REST API, AI gateway, SSE, WebSocket |
| **celery-worker** | Celery 5.3.6 | Background task processing |
| **celery-beat** | Celery 5.3.6 | Scheduled task scheduler |
| **frontend** | Node 20 / Next.js 16 | React UI with CesiumJS 3D globe |

All services have health checks, dependency ordering, named volumes for persistence, and run on an isolated bridge network (`sda-network`).

---

## Backend

**Stack:** Python 3.12, FastAPI 0.109, SQLAlchemy 2.0 (async), Alembic, Celery, structlog

### Directory Structure

```
backend/app/
├── api/v1/            # 32 REST route modules
├── agents/            # AI agents (Detour, Response, Iridium)
├── core/              # Config, security, logging, exceptions
├── db/models/         # 10 SQLAlchemy model modules
├── physics/           # SGP4 propagation, screening, risk, maneuver
├── schemas/           # 29 Pydantic request/response schemas
├── services/          # 32 service implementations
├── vendors/           # External API clients
├── celery_app.py      # Task queue configuration
├── tasks.py           # Scheduled task definitions
└── main.py            # Application entry point
```

### API Modules

| Module | Prefix | Scope |
|--------|--------|-------|
| ontology | `/ontology` | Satellites, orbits, debris, ground stations, sensors, conjunctions, space weather |
| sandbox | `/sandbox` | Scenario simulation (sessions, actors, chat, import, control) |
| incidents | `/incidents` | Incident lifecycle, cyber events, maneuver detections |
| operations | `/operations` | Formations, routes, communications, positions, collisions |
| ai | `/ai` | Chat, orchestration, agents (conjunction analyst, weather watch, Detour) |
| detour | `/detour` | Collision avoidance: screening, maneuver planning, approval workflow |
| threats | `/threats` | Proximity, anomaly, signal, orbital-similarity, GEO loiter detection |
| proximity | `/proximity` | Proximity event detection, alerts, configuration |
| adversary | `/adversary` | Adversary catalog, satellite intelligence, maneuver history |
| space_weather | `/space-weather` | Current conditions, impact assessment, per-satellite impact |
| rf_spectrum | `/rf-spectrum` | RF band analysis, satellite transmitters, operational dashboard |
| italy_bigbrother | `/italy-bigbrother` | Satellites over Italy, dependency analysis, statistics |
| collision_heatmap | `/collision-heatmap` | Orbital region risk heatmap |
| ground_track | `/ground-track` | Ground tracks, footprints, station passes |
| reentry | `/reentry` | Active reentry predictions, history |
| launch_correlation | `/launch-correlation` | Recent launches, uncorrelated objects, upcoming launches |
| country_dashboard | `/country-dashboard` | Per-country satellite statistics, operators |
| maneuver_detection | `/maneuver-detection` | Maneuver analysis and satellite history |
| debris_genealogy | `/debris-genealogy` | Fragmentation events, object lineage |
| fleet_risk | `/fleet-risk` | Fleet-wide risk aggregation and timeline |
| analytics | `/analytics` | Conjunction analysis runs, space weather impact |
| simulation | `/simulation` | Entity placement, coverage analysis |
| ingestion | `/ingestion` | File upload (TLE, observations, space weather), processing |
| comms | `/comms` | Iridium SBD messaging, chat, SSE stream |
| response | `/response` | Threat response evaluation, streaming |
| admin | `/admin` | Cache management, DB vacuum, audit export, system stats |
| search | `/search` | Full-text search across entities |
| timeline | `/timeline` | Event timeline and summary |
| audit | `/audit` | Audit trail access |
| satellite_profile | `/satellite-profile` | Per-satellite OSINT profile |
| websocket | `/ws` | Real-time threat WebSocket stream |

### Database Models

10 model modules using SQLAlchemy 2.0 with async sessions (asyncpg driver):

- **ontology** — Satellite, Orbit, GroundStation, Sensor, ConjunctionEvent, SpaceWeatherEvent, Relation
- **incidents** — Incident, ProximityEvent, IncidentAction
- **operations** — PositionReport, Route, Formation, Operation
- **sandbox** — SandboxSession, SandboxActor, SandboxCommand, SandboxScenario
- **threats** — ThreatAssessment, ThreatDetection
- **detour** — ManeuverOption, CollisionState
- **audit** — AuditEvent, QualityCheck
- **ingestion** — IngestionRun, QualityMetric
- **chat_memory** — ChatConversation, ChatMemory (pgvector)
- **users** — User, Role

Multi-tenant isolation via `TenantMixin`. Audit trail via `AuditMixin`.

### Scheduled Tasks (Celery Beat)

- `detect-maneuvers` — every 5 minutes
- `run-proximity-detection` — every 5 minutes
- `simulate-cyber-attacks` — every 5 minutes
- `fetch-space-weather` — periodic

### Physics Engine

Pure-Python orbital mechanics in `app/physics/`:

- **propagator** — SGP4 TLE propagation, state vector propagation
- **screening** — Conjunction screening with configurable threshold
- **risk** — Collision probability calculation
- **maneuver** — Delta-v maneuver planning
- **coverage** — Ground station coverage analysis

### AI Integration

LLM access via Regolo.ai (OpenAI-compatible API):

- **Chat agents** — Contextual Q&A about satellites, threats, weather
- **Conjunction analyst** — Automated risk assessment
- **Detour agent** — Multi-step collision avoidance with LangGraph (screening, risk assessment, maneuver planning, human-in-the-loop approval)
- **Response agent** — Threat response evaluation
- **Iridium comms** — Satellite communication via SBD

### Security

- JWT authentication with bcrypt password hashing
- RBAC with role hierarchy (admin, operator, analyst, viewer)
- ABAC policy engine for tenant-level isolation
- RFC 7807 `application/problem+json` error responses
- Rate limiting on AI endpoints
- Structured JSON logging with tenant context binding

### External Data Sources

| Source | Purpose |
|--------|---------|
| CelesTrak | TLE data for satellites and debris |
| SatNOGS | RF transmitter database |
| Regolo.ai | LLM inference (qwen3.5-122b, gpt-oss-120b) |
| Space-Track (USSPACECOM) | Authoritative orbital data |
| Copernicus | Earth observation data |
| ESA DISCOS | Space debris information |

---

## Frontend

**Stack:** Next.js 16 (App Router, Turbopack), React 18, TypeScript 5.3, Bun

### Directory Structure

```
frontend/src/
├── app/
│   ├── (main)/          # Authenticated pages (layout with sidebar)
│   ├── login/           # Authentication page
│   ├── api/             # Next.js API routes (proxy)
│   └── page.tsx         # Root redirect
├── components/
│   ├── CesiumMap/       # 20 Cesium visualization layers
│   ├── Sandbox/         # Scenario simulation UI
│   ├── Layout/          # Sidebar, TopBar, TabbedPage
│   ├── Dashboard/       # KPI panels
│   ├── Dialogs/         # Modal dialogs
│   ├── Chat/            # AI agent chat
│   └── ui/              # Base components (shadcn/ui)
├── lib/
│   ├── api.ts           # Centralized API client
│   ├── api/             # Domain-specific API modules
│   ├── store/           # Zustand state stores
│   ├── cesium/          # Cesium controller and utilities
│   └── hooks/           # Custom React hooks
└── types/               # TypeScript interfaces
```

### Pages

| Route | Purpose |
|-------|---------|
| `/login` | Authentication |
| `/map` | Interactive 3D Cesium globe with all visualization layers |
| `/dashboard` | KPI overview, incident and conjunction panels, satellite 3D model |
| `/sandbox` | Tactical scenario simulation with actor placement and AI chat |
| `/intelligence` | Multi-tab: threats, launches, reentry, maneuvers, debris genealogy |
| `/explorer` | Network graph and data exploration |
| `/operations` | Incidents, Detour workflow, formations, communications |
| `/italy` | Italian satellite monitoring with dependency analysis |
| `/rf-spectrum` | RF band analysis and signal monitoring |
| `/space-weather` | Solar activity, Kp index, impact assessment |
| `/system` | Admin panel, ingestion, settings |
| `/detour` | Collision avoidance workflow |

### Cesium Visualization Layers

20 specialized rendering layers on the 3D globe:

- SatelliteLayer, ItalySatelliteLayer — Orbit rendering with SGP4 propagation
- DebrisInstancedLayer — Point primitive rendering for 2500+ debris objects
- GroundStationLayer — Station markers with connection lines
- GroundTrackLayer — Orbital ground traces
- ConjunctionLayer — Conjunction event visualization
- CollisionHeatmapLayer — Orbital region risk density
- SatelliteCoverageLayer — Footprint and coverage cones
- GroundVehicleLayer, MilitaryVehicleLayer — Ground asset tracking
- SandboxActorLayer — Scenario simulation entities
- TacticalPlanningLayer — Route and formation overlay

### State Management

Zustand stores:
- **store.ts** — App state (sidebar, selected satellite, tenant, theme)
- **sandbox.ts** — Sandbox state (session, actors, chat messages, simulation control)
- **detour.ts** — Detour workflow state

### UI Design

Palantir/Bloomberg-inspired angular design system:
- **Blueprint.js 6.7** — Core component library (tables, selects, datetime)
- **Tailwind CSS 3.4** — Utility styling with custom dark palette
- **Radix UI** — Accessible primitives (dialog, dropdown, tooltip)
- Monospace technical headers (Google Sans Code)
- Dark operational theme with color-coded status indicators
- Minimal border radius (2px)

---

## Data Flow

```
CelesTrak / SatNOGS / Space-Track
        |
        v
  [Celery Tasks]  ------>  [PostgreSQL + pgvector]
        |                         |
        v                         v
  [Redis Cache]           [FastAPI REST API]
                                  |
                          +-------+-------+
                          |               |
                    [SSE/WebSocket]  [REST JSON]
                          |               |
                          v               v
                    [Next.js Frontend / CesiumJS]
```

1. **Ingestion** — Celery tasks fetch TLE data from CelesTrak, space weather, and external sources. File uploads go through MinIO.
2. **Processing** — Physics engine propagates orbits (SGP4), screens conjunctions, calculates risk scores. AI agents analyze threats.
3. **Storage** — PostgreSQL stores all domain entities. pgvector enables semantic search on chat memory. Redis caches hot data.
4. **Delivery** — REST API serves paginated data. SSE streams real-time updates. WebSocket pushes threat alerts.
5. **Visualization** — Frontend renders 3D globe with CesiumJS, fetches data via SWR with automatic revalidation.

---

## Deployment

### Development

```bash
docker compose up -d
```

Backend auto-runs `alembic upgrade head` on startup and seeds initial data (ground stations, satellites from CelesTrak, synthetic debris, conjunction events).

Frontend runs in dev mode with Turbopack hot reload (set `FRONTEND_MODE=dev`) or builds for production (default).

### Production

The Cloudflare Worker at `cloudflare-worker/` acts as an edge proxy:
- TLS termination and DDoS protection
- Routes `/api/auth/*` to Next.js (port 3000)
- Routes all other traffic to the origin server
- Adds security headers (STS, X-Content-Type-Options, X-Frame-Options)

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://...@postgres:5432/sda_db` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `MINIO_ENDPOINT` | `minio:9000` | Object storage |
| `REGOLO_API_KEY` | — | LLM API key |
| `REGOLO_BASE_URL` | `https://api.regolo.ai/v1` | LLM endpoint |
| `SECRET_KEY` | — | JWT signing key |
| `FRONTEND_MODE` | `build` | `dev` for hot reload, `build` for production |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | — | Cesium Ion access token |

---

## Testing

### Backend

```bash
python3 -m pytest tests/
```

- `tests/physics/` — Orbital mechanics unit tests (SGP4, screening, risk, maneuver)
- `tests/agents/` — AI agent graph and tool tests
- `tests/api/v1/` — API endpoint tests
- `tests/services/` — Service layer tests
- `tests/security/` — Security and auth tests
- `tests/performance/` — Performance benchmarks

### Frontend

```bash
bun run test
```

Vitest + React Testing Library for component and integration tests. Playwright for E2E.
