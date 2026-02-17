# SDA Platform - Space Domain Awareness

A Palantir-like Space Domain Awareness (SDA) platform for protecting space assets and ground infrastructure.

## Celestrack Data Attribution

This project uses satellite orbital data from **CelesTrak** (https://celestrak.org), a free public service provided by Dr. T.S. Kelso.

### Data Source

All Two-Line Element (TLE) data and General Perturbations (GP) orbital elements are sourced from:
- **Website**: https://celestrak.org/NORAD/elements/
- **API**: https://celestrak.org/NORAD/elements/gp.php

### Debris Import Script

Use the provided script to fetch and import the latest space‑debris TLE data:

```bash
# Import debris into the default tenant
python backend/scripts/fetch_celestrak_debris.py

# Specify a tenant ID
python backend/scripts/fetch_celestrak_debris.py --tenant mytenant
```
- **Maintained by**: Dr. T.S. Kelso (TS.Kelso@celestrak.org)

### Satellite Data Used

The application fetches satellite orbital data using NORAD Catalog Numbers from CelesTrak's public API. The data includes:

#### Allied Satellites (Friendly Forces)
Displayed as **BLUE** points on the 3D map:
- **Guardian Station Alpha** (ISS - NORAD ID: 25544)
- **DeepWatch One** (Hubble Space Telescope - NORAD ID: 36516)
- **TerraScan-1** (Landsat 5 - NORAD ID: 20580)
- **StarFinder-A** (TESS - NORAD ID: 43013)
- **Celestial Station** (Tiangong-1 - NORAD ID: 43205)
- **WindWatcher** (Aeolus - NORAD ID: 43689)
- **CommLink-1** (Starlink-1007 - NORAD ID: 44713)
- **WeatherEye-1** (NOAA-15 - NORAD ID: 25530)
- **NavBeacon-1** (GPS BIIR-2 - NORAD ID: 25994)
- **EyeInSky-1** (Cartosat-2F - NORAD ID: 43286)

*Note: Allied satellites use mock names for SDA simulation purposes. The real satellite names are provided in parentheses.*

#### Enemy Satellites (Unknown/Hostile Forces)
Displayed as **RED** points on the 3D map:
- **UNKNOWN-ALPHA** (CSS Tiangong - NORAD ID: 48274)
- **UNKNOWN-BETA** (ISS Nauka - NORAD ID: 49044)
- **UNKNOWN-GAMMA** (CSS Wentian - NORAD ID: 53239)
- **HOSTILE-NAV-1** (GPS BIIR-2 - NORAD ID: 24876)
- **HOSTILE-NAV-2** (GPS BIIR-5 - NORAD ID: 26407)
- **HOSTILE-NAV-3** (GPS BIIR-6 - NORAD ID: 26690)
- **HOSTILE-NAV-4** (GPS BIIR-7 - NORAD ID: 27663)
- **HOSTILE-NAV-5** (GPS BIIR-8 - NORAD ID: 27704)
- **SUSPECT-COM-1** (Galileo - NORAD ID: 40115)
- **SUSPECT-COM-2** (Galileo - NORAD ID: 40116)
- **SUSPECT-COM-3** (Starlink - NORAD ID: 41771)
- **TRACKED-OBJ-1** (NOAA 18 - NORAD ID: 27424)
- **TRACKED-OBJ-2** (NOAA 19 - NORAD ID: 33591)
- **TRACKED-OBJ-3** (MetOp-A - NORAD ID: 37214)
- **UNIDENTIFIED-1** (Swarm - NORAD ID: 39444)
- **UNIDENTIFIED-2** (TechDemoSat-1 - NORAD ID: 41465)
- **UNIDENTIFIED-3** (RemoveDEBRIS - NORAD ID: 44484)
- **CONTACT-X1** (FREGAT DEB - NORAD ID: 49271)
- **CONTACT-X2** (CSS Mengtian - NORAD ID: 54216)

*Note: Enemy satellites use code names for SDA defense simulation. These represent tracked objects from various satellite categories including navigation, communication, weather, and scientific missions. Data sourced from CelesTrak GP (General Perturbations) data sets.*

### Categories Referenced

The following CelesTrak data groups were referenced for NORAD IDs:
- **Space Stations** (https://celestrak.org/NORAD/elements/gp.php?GROUP=stations)
- **GPS Operational** (https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops)
- **Active Satellites** (https://celestrak.org/NORAD/elements/gp.php?GROUP=active)
- **Weather Satellites** (https://celestrak.org/NORAD/elements/gp.php?GROUP=weather)
- **Scientific Satellites** (https://celestrak.org/NORAD/elements/gp.php?GROUP=science)
- **Communication Satellites** (https://celestrak.org/NORAD/elements/gp.php?GROUP=comm)

### API Usage

The application fetches TLE data via the CelesTrak GP API:
```
https://celestrak.org/NORAD/elements/gp.php?CATNR=<NORAD_ID>&FORMAT=TLE
```

### Terms of Use

CelesTrak data is provided free of charge for public use. Please refer to https://celestrak.org for terms and conditions. Proper attribution is maintained in this project as required.

---

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.12)
- **Database**: PostgreSQL with pgvector extension
- **Cache**: Redis
- **Task Queue**: Celery with Redis broker
- **Storage**: MinIO (S3-compatible)
- **Authentication**: OIDC via Keycloak
- **AI**: Regolo.ai via OpenAI-compatible API

### Frontend
- **Framework**: Next.js + React + TypeScript
- **UI**: Blueprint.js
- **3D Visualization**: CesiumJS
- **Orbit Propagation**: satellite.js (SGP4)

---

## Setup

### Environment Variables

Create a `.env` file with:

```bash
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

### Running with Docker Compose

```bash
docker-compose up -d
```

### Seeding Demo Data

```bash
cd backend
python scripts/seed_demo.py
```

---

## Features

- **Real-time Satellite Tracking**: 3D globe visualization with CesiumJS
- **Orbit Propagation**: SGP4 algorithm via satellite.js
- **Conjunction Detection**: Automated collision risk analysis
- **Space Weather Monitoring**: Impact assessment on space assets
- **AI-Powered Analysis**: Regolo.ai integration for threat assessment
- **Multi-tenancy**: Complete tenant isolation
- **Audit Logging**: Full change tracking

## Detour API

The Detour subsystem provides a set of REST endpoints under `/api/v1/detour` for collision avoidance analysis and maneuver management.

### Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/detour/conjunctions/{id}/analyze` | Trigger a conjunction analysis, returns `{ "session_id": "<uuid>" }`. |
| GET | `/detour/sessions/{id}/status` | Get the current status of an analysis session. |
| GET | `/detour/sessions/{id}/results` | Retrieve final results of a completed analysis. |
| POST | `/detour/maneuvers/{id}/approve` | Approve a proposed maneuver plan. |
| POST | `/detour/maneuvers/{id}/reject` | Reject a maneuver plan with a reason. |
| POST | `/detour/maneuvers/{id}/execute` | Execute an approved maneuver plan (admin only). |
| GET | `/detour/satellites/{id}/state` | Get the detour‑specific state for a satellite. |
| GET | `/detour/satellites/{id}/maneuvers` | List maneuver history for a satellite. |
| POST | `/detour/screening/run` | Run manual conjunction screening. |

### Example: Trigger Analysis

```bash
curl -X POST "http://localhost:8000/api/v1/detour/conjunctions/12345/analyze" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json"
```

Response:

```json
{
  "session_id": "f2c8e7a4-9c12-4d35-a6f9-8b2c1d2e9e5f"
}
```

### Example: Approve Maneuver

```bash
curl -X POST "http://localhost:8000/api/v1/detour/maneuvers/plan123/approve" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Approved after safety review"}'
```

Response (excerpt):

```json
{
  "id": "plan123",
  "conjunction_analysis_id": "analysis456",
  "maneuver_type": "in-plane",
  "delta_v_m_s": 0.45,
  "fuel_cost_kg": 12.3,
  "status": "PROPOSED",
  "approved_by": "operator123",
  "executed_at": null
}
```

### Integration Guide

- Use the generated OpenAPI specification at `/api/openapi.json` for client generation.
- The Swagger UI at `/api/docs` provides an interactive interface.
- All endpoints require a valid JWT containing a `tenant_id` claim; RBAC controls access (viewer/operator/admin).
- Errors follow RFC 7807 problem‑details format.

### Detailed API Documentation

For a complete reference including request/response schemas, examples for each endpoint, and SSE streaming details, see the dedicated documentation file:

- `docs/DETOUR_API.md`

---

## License

This project is for educational and demonstration purposes.

Satellite data provided by CelesTrak (https://celestrak.org).

---

## Acknowledgments

- **CelesTrak** (Dr. T.S. Kelso) - Satellite orbital data
- **CesiumJS** - 3D globe visualization
- **satellite.js** - JavaScript SGP4 implementation
- **Palantir** - UI/UX inspiration
