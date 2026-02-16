# Detour API Documentation

## Overview
The Detour subsystem provides a REST API for collision‑avoidance analysis, maneuver planning, and satellite state management. All endpoints are served under the base path `/api/v1/detour` and are documented in the OpenAPI schema available at `/api/openapi.json` (Swagger UI at `/api/docs`).

## Authentication & RBAC
* **Authentication** – Every request must contain a valid JWT in the `Authorization: Bearer <token>` header. The token must include a `tenant_id` claim.
* **Roles** – The service enforces role‑based access control (RBAC):
  * **viewer** – Can read status, results and satellite state.
  * **operator** – Can trigger analyses, run manual screening, approve/reject maneuver plans.
  * **admin** – All operator privileges plus the ability to **execute** approved maneuvers.

All errors follow the RFC 7807 *Problem Details* format.

---

## Endpoints

| Method | Path | Summary | RBAC |
| ------ | ---- | ------- | ---- |
| **POST** | `/detour/conjunctions/{conjunction_id}/analyze` | Trigger analysis for a conjunction event | operator |
| **GET** | `/detour/sessions/{session_id}/status` | Get current analysis status (SSE streaming supported) | viewer |
| **GET** | `/detour/sessions/{session_id}/results` | Retrieve final results of a completed analysis | viewer |
| **POST** | `/detour/maneuvers/{plan_id}/approve` | Approve a proposed maneuver plan | operator |
| **POST** | `/detour/maneuvers/{plan_id}/reject` | Reject a maneuver plan (provide reason) | operator |
| **POST** | `/detour/maneuvers/{plan_id}/execute` | Execute an approved maneuver plan (admin only) | admin |
| **GET** | `/detour/satellites/{satellite_id}/state` | Get detour‑specific state for a satellite | viewer |
| **GET** | `/detour/satellites/{satellite_id}/maneuvers` | List maneuver history for a satellite | viewer |
| **POST** | `/detour/screening/run` | Run manual conjunction screening | operator |

---

### 1. Trigger Conjunction Analysis
```http
POST /detour/conjunctions/{conjunction_id}/analyze HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json
```
**Response** (`200 OK`):
```json
{ "session_id": "<uuid>" }
```
Creates a new `DetourAgentSession` and starts the pipeline.

---

### 2. Get Analysis Status (SSE)
```http
GET /detour/sessions/{session_id}/status HTTP/1.1
Authorization: Bearer <jwt>
Accept: text/event-stream
```
**Response** (`200 OK`, `Content-Type: application/json` or `text/event-stream`):
```json
{
  "session_id": "<uuid>",
  "status": "active",
  "started_at": "2026-02-16T12:00:00Z",
  "completed_at": null,
  "events": []
}
```
When the `Accept` header requests `text/event-stream`, the endpoint streams `AgentEvent` objects as they occur.

---

### 3. Get Analysis Results
```http
GET /detour/sessions/{session_id}/results HTTP/1.1
Authorization: Bearer <jwt>
```
**Success (`200 OK`)** – only when the session status is `completed`:
```json
{
  "session_id": "<uuid>",
  "status": "completed",
  "output_data": {
    "ops_brief": { ... },
    "maneuver_options": [ ... ],
    "risk_assessment": { ... }
  }
}
```
**Error (`400 Bad Request`)** – if the analysis is not yet complete. The error follows RFC 7807 with `type` ending in `analysis-not-complete`.

---

### 4. Approve Maneuver Plan
```http
POST /detour/maneuvers/{plan_id}/approve HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{ "notes": "Approved after safety review" }
```
**Response (`200 OK`)** – returns the updated `ManeuverPlanSchema` where `status` is `approved`.

---

### 5. Reject Maneuver Plan
```http
POST /detour/maneuvers/{plan_id}/reject HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{ "reason": "Unsafe maneuver" }
```
**Response (`200 OK`)** – returns the updated plan with `status` `rejected` and the rejection reason stored in `ai_recommendation`.

---

### 6. Execute Maneuver Plan (Admin only)
```http
POST /detour/maneuvers/{plan_id}/execute HTTP/1.1
Authorization: Bearer <jwt>
```
**Response (`200 OK`)**:
```json
{ "plan_id": "<uuid>", "status": "executed", "executed_at": "2026-02-16T13:45:00Z" }
```
Updates satellite fuel and delta‑v budget accordingly.

---

### 7. Get Satellite State
```http
GET /detour/satellites/{satellite_id}/state HTTP/1.1
Authorization: Bearer <jwt>
```
**Response (`200 OK`)** – `SatelliteStateSchema` JSON.

---

### 8. List Maneuver History
```http
GET /detour/satellites/{satellite_id}/maneuvers HTTP/1.1
Authorization: Bearer <jwt>
```
**Response (`200 OK`)** – list of `ManeuverPlanSchema` objects.

---

### 9. Run Manual Screening
```http
POST /detour/screening/run HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{ "satellite_id": "sat123", "time_window_hours": 72, "threshold_km": 5.0 }
```
**Response (`200 OK`)** – raw screening result, typically:
```json
{ "candidates": [ { "candidate_id": "c1", "tca": "2026-02-16T14:00:00Z", "miss_distance_km": 3.2, "collision_probability": 0.00012, "risk_level": "high" } ], "generated_at": "2026-02-16T12:01:00Z" }
```

---

## Error Format (RFC 7807)
All error responses contain the following fields:
* `type` – A URI identifying the error type (e.g. `https://example.com/problems/analysis-not-complete`).
* `title` – Short, human‑readable summary.
* `status` – HTTP status code.
* `detail` – Detailed description.
* `instance` – The request path.

---

## OpenAPI / Swagger
The complete OpenAPI specification is generated automatically by FastAPI and can be accessed at:
```
GET /api/openapi.json
```
The interactive Swagger UI is available at:
```
GET /api/docs
```
Use these endpoints to generate client SDKs or explore the API.

---

## Change Log
* **v1.0** – Initial Detour API implementation (endpoints, RBAC, SSE streaming).
* **v1.1** – Added detailed docstrings, examples, and error documentation.

---

*Generated on $(date)*