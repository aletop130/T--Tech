# SDA Platform - Instructions for AI Coding Agent

## Overview
Build a Palantir-like Space Domain Awareness (SDA) / Space Situational Awareness (SSA) platform focused on protecting space assets and ground infrastructure.

## Technology Stack

### Frontend
- **Framework**: Vite + React + TypeScript
- **UI Style**: Palantir-like (left navigation, object explorer, graph view, timeline, map, filters)
- **Visualization**: D3.js or vis-network for graph view, mapping library for map view

### Backend
- **Framework**: FastAPI (Python 3.12)
- **Database**: PostgreSQL with pgvector extension
- **Cache**: Redis
- **Task Queue**: Celery with Redis broker
- **Storage**: MinIO (S3-compatible) for file ingestion
- **Authentication**: OIDC via Keycloak (in docker-compose)
- **AI**: Regolo.ai via OpenAI-compatible API

### AI Configuration
- **Model**: "gpt-oss-120b"
- **Base URL**: ENV `REG0LO_BASE_URL` (e.g., https://<host>/v1)
- **API Key**: ENV `REG0LO_API_KEY`
- **Critical**: All AI calls MUST go through backend, never from browser

## Repository Structure (MANDATORY)
```
gestionale/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   │   └── main.py
│   ├── migrations/
│   ├── scripts/
│   │   └── seed_demo.py
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.tsx
│   ├── public/
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
├── docs/
│   └── ARCHITECTURE.md
├── docker-compose.yml
└── .env.example
```

## MVP Features

### 1. Data Fabric (Ingestion + Lineage)

**Capabilities:**
- Import TLE files (Two-Line Element sets)
- Import observation data (JSON demo format)
- Import space weather data (JSON demo format)

**Pipeline:**
a) Upload file → MinIO storage
b) Parsing/normalization → PostgreSQL (raw + curated tables)
c) Data quality checks:
   - Schema validation
   - Null checks
   - Range checks
d) Lineage tracking in `ingestion_runs` table
e) Vector indexing for text/descriptions (pgvector)
f) Full-text search indexing

**Tables Required:**
- `ingestion_runs` (id, filename, status, records_processed, errors, lineage_data, created_at)
- `raw_tle_data` (id, norad_id, tle_line1, tle_line2, ingestion_run_id, created_at)
- `curated_satellites` (id, norad_id, name, object_type, orbit_class, tle_id, vector_embedding, created_at, updated_at)
- `observations` (id, sensor_id, satellite_id, timestamp, data, quality_score)
- `space_weather_events` (id, event_type, kp_index, timestamp, severity, description, vector_embedding)

### 2. Ontology / Operational Data Model (Foundry-style)

**Object Types:**
1. **Satellite** - Space assets
2. **Orbit** - Orbital parameters
3. **Sensor** - Observation sensors
4. **GroundStation** - Ground infrastructure
5. **RFLink** - Radio frequency links
6. **SpaceWeatherEvent** - Solar/space weather
7. **ConjunctionEvent** - Close approach events
8. **Incident** - Operational incidents
9. **ThreatIndicator** - Threat data
10. **UserAction** - Audit trail

**Relationships:**
- SATELLITE → ORBIT (has orbit)
- SENSOR → OBSERVES → SATELLITE
- GROUND_STATION → HAS_LINK → RF_LINK
- SATELLITE → HAS_EVENT → CONJUNCTION_EVENT
- INCIDENT → AFFECTS → (Satellite | GroundStation | RFLink)

**Requirements:**
- CRUD operations for all objects and relationships
- Object page with: attributes, relationships, timeline events, audit log
- Global search: by name, NORAD ID, tags, description
- Graph visualization of relationships

**Tables Required:**
- `ontology_objects` (id, object_type, name, attributes, created_at, updated_at, tenant_id)
- `ontology_relationships` (id, from_object_id, to_object_id, relationship_type, attributes, created_at)
- `ontology_timeline_events` (id, object_id, event_type, timestamp, data, created_at)

### 3. Algorithms (SDA Core)

#### Orbit Propagation
- Use Python `sgp4` library
- Calculate positions from TLE over time windows
- Store propagated positions for analysis

**Table:** `propagated_positions` (id, satellite_id, timestamp, position_x, position_y, position_z, velocity_x, velocity_y, velocity_z)

#### Conjunction Detection (MVP)
- **Input**: List of satellites (demo: 200-500 objects)
- **Time Window**: 24-72 hours
- **Algorithm**: O(N²) with temporal pruning (acceptable for MVP with <500 objects)
- **Output**: Events with:
  - Minimum distance estimate
  - Timestamp of closest approach
  - Risk score (heuristic-based)
  - Primary and secondary object IDs

**Risk Score Calculation (Heuristic):**
```python
risk_score = f(distance, relative_velocity, object_sizes, orbit_uncertainty)
```

**Table:** `conjunction_events` (id, primary_object_id, secondary_object_id, closest_approach_time, min_distance_km, risk_score, probability_of_collision, status, created_at)

**Documentation Required:** Note O(N²) complexity limits and scaling path (HEALPix grid, Ball Tree, distributed processing)

#### Space Weather Impact (MVP)
- **Input**: Space weather events (Kp index, alerts) from JSON demo
- **Processing**: Calculate service impact scores for:
  - GNSS accuracy degradation
  - RF communication interference
  - Atmospheric drag effects
- **Method**: Rule-based mapping with weights

**Table:** `space_weather_impacts` (id, event_id, service_type, impact_score, recommendations, created_at)

### 4. Services (API + UI)

#### Backend API Endpoints (/v1)

**Authentication:**
- `GET /v1/auth/callback` - OIDC callback
- `GET /v1/auth/claims` - Get user claims/roles

**Ontology:**
- `GET /v1/ontology/objects` - List objects with filters
- `POST /v1/ontology/objects` - Create object
- `GET /v1/ontology/objects/{id}` - Get object details
- `PUT /v1/ontology/objects/{id}` - Update object
- `DELETE /v1/ontology/objects/{id}` - Delete object
- `GET /v1/ontology/relationships` - List relationships
- `POST /v1/ontology/relationships` - Create relationship
- `GET /v1/ontology/search` - Global search

**Ingestion:**
- `POST /v1/ingestion/upload` - Upload file to MinIO
- `GET /v1/ingestion/runs` - List ingestion runs
- `GET /v1/ingestion/runs/{id}` - Get run details with lineage
- `GET /v1/ingestion/runs/{id}/quality` - Quality report

**Analytics:**
- `POST /v1/analytics/conjunction/run` - Run conjunction analysis
- `GET /v1/analytics/conjunction/results` - Get conjunction events
- `POST /v1/analytics/space-weather/ingest` - Ingest space weather
- `GET /v1/analytics/space-weather/impact` - Get impact assessments

**Incidents:**
- `GET /v1/incidents` - List incidents
- `POST /v1/incidents` - Create incident
- `GET /v1/incidents/{id}` - Get incident details
- `PUT /v1/incidents/{id}` - Update incident
- `POST /v1/incidents/{id}/comments` - Add comment
- `POST /v1/incidents/{id}/actions` - Execute action

**Audit:**
- `GET /v1/audit/events` - Query audit log
- `GET /v1/audit/objects/{id}` - Audit trail for object

**AI Gateway:**
- `POST /v1/ai/chat` - LLM chat with context
  - Request: `{messages: [...], context_object_ids: [...]}`
  - Retrieves context from Postgres
  - Builds structured prompt
  - Calls Regolo API
  - Returns: text or validated JSON

**AI Agents:**
- `POST /v1/ai/agents/conjunction-analyst` - Conjunction Analyst agent
  - Input: `conjunction_event_id`
  - Output: Risk explanation + 2-3 COA (Courses of Action)
  - JSON fields: `{severity, recommended_action, maneuver_window, expected_delta_v, constraints, confidence}`

- `POST /v1/ai/agents/space-weather-watch` - Space Weather Watch agent
  - Input: `{time_range, asset_ids}`
  - Output: Expected impacts + preventive playbook
  - JSON fields: `{risk_by_service, recommended_controls, monitoring_actions, confidence}`

#### Frontend Pages

**Layout:**
- Left sidebar with icons: Dashboard, Explorer, Graph, Timeline, Map, Incidents, Ingestion, Admin
- Top bar: Global search + tenant switch + user menu

**Pages:**
1. **Dashboard** - KPI cards (events count, incidents, ingestion status, alerts)
2. **Object Explorer** - List view with filters, quick view panel
3. **Graph View** - D3/vis-network visualization of relationships
4. **Timeline** - Event timeline for selected asset
5. **Map View** - Ground stations + simplified satellite footprints
6. **Incident Console** - Queue, details panel, actions/approvals workflow
7. **Ingestion Console** - Upload interface, run logs, quality reports
8. **Object Page** - Central view with tabs: Info, Relations, Timeline, Audit, AI Assistant

### 5. AI Implementation (Regolo.ai)

#### AI Gateway Backend

**Endpoint:** `POST /v1/ai/chat`

**Process:**
1. Accept request: `{messages, context_object_ids}`
2. Retrieve context from PostgreSQL (objects, relations, recent events)
3. Build system prompt with ground truth + output formatting instructions
4. Call Regolo OpenAI-compatible API:
   ```python
   client = OpenAI(
       base_url=os.getenv("REG0LO_BASE_URL"),
       api_key=os.getenv("REG0LO_API_KEY")
   )
   response = client.chat.completions.create(
       model="gpt-oss-120b",
       messages=messages,
       response_format={"type": "json_object"}  # When JSON needed
   )
   ```
5. Validate and return output

**Function Calling/Tools (Backend Implementation):**
Available tools:
- `get_object(object_id)` - Retrieve object details
- `search_objects(query)` - Search ontology
- `create_incident(payload)` - Create new incident
- `update_incident_status(incident_id, status)` - Update incident
- `propose_mitigation(conjunction_event_id)` - Generate mitigation options

**Agent 1: Conjunction Analyst**
- **Trigger:** POST `/v1/ai/agents/conjunction-analyst`
- **Input:** `conjunction_event_id`
- **Prompt Template:**
  ```
  You are a Conjunction Analyst expert. Analyze this conjunction event:
  
  Event Details: [retrieved from DB]
  Primary Object: [satellite details]
  Secondary Object: [object details]
  Closest Approach: [time, distance, probability]
  
  Provide:
  1. Risk explanation in plain language
  2. 2-3 recommended Courses of Action (COA)
  3. Structured JSON with: severity, recommended_action, maneuver_window, expected_delta_v, constraints, confidence
  ```

**Agent 2: Space Weather Watch**
- **Trigger:** POST `/v1/ai/agents/space-weather-watch`
- **Input:** `{time_range, asset_ids}`
- **Prompt Template:**
  ```
  You are a Space Weather Analyst. Assess impacts for the requested period:
  
  Time Range: [start] to [end]
  Assets: [list with types and orbits]
  Active Space Weather Events: [from DB]
  
  Provide:
  1. Risk assessment by service (GNSS, RF, drag)
  2. Recommended preventive controls
  3. Monitoring actions
  4. Structured JSON with: risk_by_service, recommended_controls, monitoring_actions, confidence
  ```

**Rate Limiting & Logging:**
- Rate limit AI endpoints (e.g., 10 req/min per user)
- Log token usage per request
- Store AI interactions for audit

## Security & Governance

### Multi-tenancy
- Every record has `tenant_id` column
- All queries filtered by tenant_id
- Tenant isolation enforced at API level

### ABAC (Attribute-Based Access Control)
- Policies based on: role + tenant + ownership
- Use PostgreSQL Row Level Security (RLS) where possible
- Otherwise enforce in Data Access Layer (DAL)

### Audit Logging
**Table:** `audit_events`
```json
{
  "id": "uuid",
  "timestamp": "iso8601",
  "user_id": "uuid",
  "tenant_id": "uuid",
  "action": "CREATE|UPDATE|DELETE",
  "entity_type": "string",
  "entity_id": "uuid",
  "before": "json",
  "after": "json",
  "ip_address": "string",
  "user_agent": "string"
}
```
- Log every write operation
- Store before/after state for updates

## Deliverables

### 1. Docker Compose Stack
File: `gestionale/docker-compose.yml`

Services:
- `postgres` (PostgreSQL 15+ with pgvector)
- `redis` (Redis 7+)
- `minio` (MinIO latest)
- `keycloak` (Keycloak 22+)
- `backend` (FastAPI app)
- `celery-worker` (Celery workers)
- `frontend` (Vite/React dev server or nginx)

### 2. Seed Script
File: `gestionale/backend/scripts/seed_demo.py`

Populate with:
- 200+ satellites with TLE data
- 5 ground stations (realistic locations)
- 10 sensors linked to stations
- 50+ space weather events
- Run conjunction detection and save results
- Create sample incidents

### 3. Documentation

**File: `gestionale/backend/README.md`**
- Environment variables list
- How to run locally
- Database migrations (Alembic)
- API endpoints documentation
- How to configure Regolo.ai

**File: `gestionale/frontend/README.md`**
- Build and run instructions
- Main pages overview
- Component structure

**File: `gestionale/docs/ARCHITECTURE.md`**
- Data schema diagrams
- Ontology model
- Data flow diagrams
- Scaling notes
- AI integration architecture

### 4. Tests

**Backend Tests:**
- File: `gestionale/backend/tests/`
- pytest for 5+ critical endpoints
- JSON validation tests for AI agents
- Database integration tests

**Frontend Tests:**
- File: `gestionale/frontend/tests/`
- Smoke tests for main routes
- Playwright or Vitest for routing validation

## Quality Requirements

### Code Quality
- **Type Safety**: Pydantic v2 for all request/response models
- **Type Checking**: mypy (best effort)
- **Code Style**: Black formatter, isort
- **Linting**: ruff or flake8

### Logging
- Structured JSON logging throughout
- Request/response logging
- Error tracking with stack traces

### Error Handling
- Consistent error format (RFC 7807 Problem Details)
```json
{
  "type": "string",
  "title": "string",
  "status": 400,
  "detail": "string",
  "instance": "string"
}
```

### Security
- No hardcoded credentials
- All secrets via environment variables
- Input validation on all endpoints
- SQL injection prevention (use ORM)
- XSS protection in frontend

### UI/UX
- Clean, responsive design
- Fast filters with debouncing
- Pagination for all lists
- Loading states
- Error boundaries

## UX Specifications (Palantir-like)

### Layout
- **Sidebar**: Fixed left, 64px width, icons + tooltips
  - Icons: Dashboard, Explorer, Graph, Timeline, Map, Incidents, Ingestion, Admin
- **Top Bar**: 56px height
  - Global search (centered, prominent)
  - Tenant switch (dropdown)
  - User menu (avatar + dropdown)
- **Main Content**: Flexible, card-based layout
- **Object Page**: 
  - Header: Object name, type badge, actions
  - Tabs: Info, Relations, Timeline, Audit, Ask AI
  - Sidebar: Related objects quick links

### Color Scheme
- Dark theme preferred (Palantir-style)
- Primary: Blue (#0066CC)
- Success: Green
- Warning: Orange/Yellow
- Danger: Red
- Background: Dark grays (#1a1a1a, #2d2d2d)
- Text: Light grays (#e0e0e0, #a0a0a0)

### Typography
- Sans-serif (Inter or system font)
- Monospace for technical data (JetBrains Mono)

## Implementation Steps

### Phase 1: Foundation
1. Create repository structure
2. Set up docker-compose with all services
3. Configure PostgreSQL with pgvector
4. Set up Keycloak with realm and clients
5. Create base FastAPI app with health check
6. Create base React app with routing

### Phase 2: Database & Models
1. Create all SQLAlchemy models
2. Set up Alembic migrations
3. Implement audit logging decorator
4. Implement multi-tenancy middleware
5. Create seed script

### Phase 3: Core API
1. Implement authentication endpoints
2. Implement ontology CRUD endpoints
3. Implement ingestion pipeline
4. Implement basic analytics (conjunction, space weather)
5. Add audit endpoints

### Phase 4: Algorithms
1. Implement SGP4 propagation
2. Implement O(N²) conjunction detection
3. Implement space weather impact scoring
4. Create Celery tasks for background processing

### Phase 5: AI Integration
1. Set up Regolo.ai client
2. Implement AI gateway with context retrieval
3. Implement function calling/tools
4. Create Conjunction Analyst agent
5. Create Space Weather Watch agent
6. Add rate limiting and logging

### Phase 6: Frontend
1. Implement layout (sidebar, top bar)
2. Create Dashboard page
3. Create Object Explorer with filters
4. Create Graph View (D3)
5. Create Timeline view
6. Create Map view
7. Create Incident Console
8. Create Ingestion Console
9. Create Object Page with AI integration

### Phase 7: Polish & Documentation
1. Add comprehensive error handling
2. Add loading states
3. Write tests
4. Write documentation
5. End-to-end testing

## Environment Variables

### Backend (.env)
```
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/sda_db

# Redis
REDIS_URL=redis://redis:6379/0

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=sda-data

# Keycloak
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=sda
KEYCLOAK_CLIENT_ID=sda-backend
KEYCLOAK_CLIENT_SECRET=secret

# Regolo.ai
REG0LO_BASE_URL=https://api.regolo.ai/v1
REG0LO_API_KEY=your-api-key

# App
SECRET_KEY=random-secret-key
DEBUG=false
LOG_LEVEL=INFO
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000/v1
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=sda
VITE_KEYCLOAK_CLIENT_ID=sda-frontend
```

## Notes

- This is an MVP - focus on end-to-end functionality
- Document any "stub" implementations clearly
- Ensure demo data allows full workflow: ingest → ontology → analytics → incident → AI explanation
- Python version: 3.12
- When writing/patching files, always indicate full path and context

## Success Criteria

1. ✓ Docker compose starts all services successfully
2. ✓ Seed script populates database with demo data
3. ✓ User can login via Keycloak
4. ✓ User can view dashboard with real KPIs
5. ✓ User can explore objects and see relationships
6. ✓ User can run conjunction analysis
7. ✓ User can view and manage incidents
8. ✓ AI agents provide structured JSON responses
9. ✓ All endpoints return proper error responses
10. ✓ Audit log captures all changes
