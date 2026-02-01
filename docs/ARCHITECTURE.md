# SDA Platform Architecture

## Overview

The SDA (Space Domain Awareness) Platform is a Palantir-inspired system
for space situational awareness, focusing on protecting space assets and
ground infrastructure.

## System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Dashboard│ │Explorer │ │  Graph  │ │Timeline │ │   Map   │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      API v1 Routes                            │  │
│  │ /ontology/* │ /incidents/* │ /analytics/* │ /ai/* │ /audit/* │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                       Services Layer                          │  │
│  │ Ontology │ Incidents │ Analytics │ AI │ Ingestion │ Audit    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  PostgreSQL │ │    Redis    │ │    MinIO    │ │ Regolo.ai   │
│  + pgvector │ │   (cache)   │ │  (storage)  │ │   (LLM)     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## Data Model / Ontology

### Core Objects

| Object           | Description                              |
|------------------|------------------------------------------|
| Satellite        | Space object (active or debris)          |
| Orbit            | Orbital parameters (TLE-derived)         |
| GroundStation    | Ground facility for tracking/comms       |
| Sensor           | Tracking sensor (radar, optical, etc.)   |
| RFLink           | RF communication link                    |
| SpaceWeatherEvent| Solar/geomagnetic events                 |
| ConjunctionEvent | Close approach between objects           |
| Incident         | Operational/security incident            |

### Relations

```
Satellite ──────────────► Orbit (HAS_ORBIT)
Sensor ─────────────────► Satellite (OBSERVES)
GroundStation ──────────► Sensor (HAS_SENSOR)
GroundStation ──────────► RFLink (HAS_LINK)
Satellite ──────────────► ConjunctionEvent (INVOLVED_IN)
Incident ───────────────► Satellite/GS/RFLink (AFFECTS)
```

## Database Schema

### Multi-tenancy

All data tables include `tenant_id` for row-level isolation.
ABAC policies enforce tenant boundaries.

### Key Tables

- `tenants` - Organization/tenant configuration
- `users` - User accounts with roles
- `satellites` - Space object catalog
- `orbits` - Orbital elements with TLE data
- `ground_stations` - Ground facility inventory
- `sensors` - Sensor configuration
- `space_weather_events` - Solar/geomagnetic events
- `conjunction_events` - Close approach predictions
- `incidents` - Incident tracking
- `ingestion_runs` - Data lineage
- `audit_events` - Complete audit trail

## API Design

### Versioned REST API

All endpoints under `/api/v1/`:

```
GET/POST   /ontology/satellites
GET/PATCH  /ontology/satellites/{id}
GET/POST   /ontology/ground-stations
GET/POST   /ontology/conjunctions
GET/POST   /incidents
POST       /incidents/{id}/status
GET/POST   /ingestion/runs
POST       /ingestion/upload/tle
POST       /analytics/conjunction/run
POST       /ai/chat
POST       /ai/agents/conjunction-analyst
POST       /ai/agents/space-weather-watch
GET        /audit
GET        /search?q={query}
```

### Response Format

All responses use JSON. Errors return RFC 7807 `problem+json`:

```json
{
  "type": "https://sda-platform.io/errors/not-found",
  "title": "Satellite Not Found",
  "status": 404,
  "detail": "Satellite with ID xyz not found"
}
```

## Analytics Algorithms

### Conjunction Detection

1. Load TLEs for tracked objects
2. Propagate orbits using SGP4 (python-sgp4)
3. O(N²) pairwise distance checks with temporal pruning
4. Flag close approaches within screening volume
5. Compute risk score based on miss distance

**Scaling considerations:**
- For >10k objects: Use spatial indexing (HEALPix/ball-tree)
- Parallelize with Celery workers
- Pre-filter by orbit regime (LEO/MEO/GEO)

### Space Weather Impact

Impact scores computed per service:

| Service    | Weights                                |
|------------|----------------------------------------|
| GNSS       | Kp(0.4), Dst(0.2), Proton(0.3), SW(0.1)|
| RF Comms   | Kp(0.3), Dst(0.3), Proton(0.2), SW(0.2)|
| Drag       | Kp(0.2), Dst(0.1), Proton(0.1), SW(0.6)|
| Radiation  | Kp(0.1), Dst(0.1), Proton(0.7), SW(0.1)|

## AI Integration

### Regolo.ai Gateway

All AI calls routed through backend gateway:
- Context assembly from database
- Prompt construction with ground truth
- Rate limiting and token tracking
- Response validation

### AI Agents

**Conjunction Analyst:**
- Input: conjunction_event_id
- Output: Risk analysis + COA recommendations

**Space Weather Watch:**
- Input: time_range, asset_ids
- Output: Impact assessment + playbook

## Security

### Authentication

- Keycloak for identity management
- JWT tokens with tenant_id claim
- API key support for service accounts

### Authorization (ABAC)

Policies based on:
- User role (viewer, analyst, admin)
- Tenant ownership
- Resource classification

### Audit

Every write operation logged:
- Timestamp, user, tenant
- Entity type/ID
- Before/after state
- IP, user-agent

## Deployment

### Docker Compose Stack

```yaml
services:
  postgres      # PostgreSQL + pgvector
  redis         # Cache + Celery broker
  minio         # Object storage
  keycloak      # Identity provider
  backend       # FastAPI app
  celery-worker # Background tasks
  celery-beat   # Scheduled tasks
  frontend      # Next.js app
```

### Environment Variables

Key configuration via environment:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `REGOLO_API_KEY` - AI service key
- `SECRET_KEY` - JWT signing key

## Scaling Notes

### Horizontal Scaling

- Backend: Stateless, scale behind load balancer
- Celery: Add workers for throughput
- Database: Read replicas for queries

### Performance Targets

- API response: <100ms p95
- Search: <200ms
- Conjunction analysis: <5min for 500 objects
- AI response: <10s (LLM dependent)

