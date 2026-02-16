# Ralph Tasks - Implementazione Sistema Detour

> **Documento di riferimento:** `docs/DETOUR_IMPLEMENTATION_PLAN.txt`
> **Ambiente virtuale:** `source ~/T--Tech/backend/.venv/bin/activate`
> **Comando check:** Dopo ogni task, eseguire test/check pertinenti
> **Marker completamento:** Stampare `READY_FOR_NEXT_TASK` quando un task è finito, `COMPLETE` quando tutti i task sono completati

---

## FASE 1: Foundation (Struttura e Dipendenze)

- [x] Task 1.1: Setup Dipendenze (backend/requirements.txt)
  - Aggiungere: langgraph>=0.2.0, langchain>=0.3.0, langchain-openai>=0.2.0
  - Aggiungere: poliastro>=0.17.0, astropy>=6.0.0, skyfield>=1.48, satellite.py>=0.2.0
  - Aggiungere: numpy>=1.26.0, scipy>=1.12.0, aiofiles>=23.2.1
  - Eseguire: `pip install -r requirements.txt`
  - Verificare compatibilità Python 3.11+

- [x] Task 1.2: Creazione Struttura Directory
  - Creare: backend/app/physics/__init__.py
  - Creare: backend/app/agents/detour/__init__.py
  - Creare: backend/app/services/detour/__init__.py
  - Verificare che i moduli siano importabili

- [x] Task 1.3: Costanti Physics (backend/app/physics/constants.py)
  - MU_EARTH: 3.986004418e14 (m^3/s^2)
  - R_EARTH: 6378137.0 (m)
  - J2: 0.00108263
  - OMEGA_EARTH: 7.2921158553e-5 (rad/s)
  - Funzioni conversione: km <-> m, deg <-> rad
  - Costanti screening: THRESHOLD_KM=5.0, RADIUS_KM=10.0
  - Type hints obbligatori per tutte le costanti

- [x] Task 1.4: Modelli Database Detour (backend/app/db/models/detour.py + Alembic)
  - Tabella detour_satellite_state: id, satellite_id (FK), tenant_id, fuel_remaining_kg, delta_v_budget_m_s, timestamps
  - Tabella detour_conjunction_analysis: id, conjunction_event_id (FK), tenant_id, collision_probability, risk_level, miss_distance_km, tca, analysis_status, ai_analysis (JSONB), timestamps
  - Tabella detour_maneuver_plans: id, conjunction_analysis_id (FK), tenant_id, maneuver_type, delta_v_m_s, fuel_cost_kg, execution_window, expected_miss_distance_km, risk_reduction_percent, status, ai_recommendation (JSONB), created_by, approved_by, executed_at, timestamps
  - Tabella detour_agent_sessions: id, tenant_id, session_type, status, input_data (JSONB), output_data (JSONB), events (JSONB), started_at, completed_at, timestamps
  - Creare migration: `alembic revision --autogenerate -m "add_detour_tables"`
  - Eseguire: `alembic upgrade head`

---

## FASE 2: Core Physics Engine

- [x] Task 2.1: Propagatore Orbite (backend/app/physics/propagator.py)
  - Funzione propagate_tle(tle_line1, tle_line2, epochs) -> np.ndarray (Nx6 [x,y,z,vx,vy,vz] in km, km/s ECI J2000)
  - Funzione propagate_state_vector(state, dt_seconds) -> StateVector (Kepler + J2)
  - Funzione tle_to_state_vector(tle_line1, tle_line2, epoch) -> StateVector
  - Testare con TLE ISS noto

- [x] Task 2.2: Screening Congiunzioni (backend/app/physics/screening.py)
  - Funzione screen_conjunctions(primary_tle, catalog, time_window_hours=72, threshold_km=5.0) -> list[ConjunctionCandidate]
  - Griglia temporale step 10 min, distanza minima approssimata
  - Funzione refine_conjunction(candidate, iterations=10) -> ConjunctionEvent
  - Newton-Raphson per TCA esatto, geometria miss (radial, intrack, crosstrack)

- [x] Task 2.3: Calcolo Rischio Collisione (backend/app/physics/risk.py)
  - Funzione calculate_collision_probability_chan(primary_cov, secondary_cov, miss_distance, combined_radius) -> float
  - Formula Chan 1997, input matrici covarianza 3x3
  - Funzione assess_risk_level(collision_prob, miss_distance_km, object_sizes) -> RiskLevel
  - Funzione calculate_maximum_conjunction_time(primary_state, secondary_state, threshold_km=10.0) -> float
  - Validare con casi test letteratura

- [x] Task 2.4: Calcolo Manovre Avoidance (backend/app/physics/maneuver.py)
  - Funzione calculate_raan_precession_rate(orbit) -> float (effetto J2)
  - Funzione propose_in_plane_maneuvers(primary, conjunction, delta_v_budget=0.5) -> list[ManeuverOption]
  - Burn pro/retrograde, ottimizzazione timing
  - Funzione propose_out_of_plane_maneuvers(primary, conjunction, delta_v_budget=0.5) -> list[ManeuverOption]
  - Funzione optimize_maneuver_timing(maneuvers, conjunction) -> ManeuverOption
  - Funzione calculate_delta_v_cost(maneuver, satellite) -> float (Tsiolkovsky)

- [x] Task 2.5: Unit Tests Physics
  - backend/tests/physics/test_propagator.py: valid input, invalid TLE, epoch specific
  - backend/tests/physics/test_screening.py: no threats (GEO vs LEO), finds threats, refinement precision
  - backend/tests/physics/test_risk.py: high/low Pc, risk classification
  - backend/tests/physics/test_maneuver.py: risk reduction >50%, fuel cost, Tsiolkovsky
  - Coverage > 90% per modulo physics

---

## FASE 3: Agent Framework (LangGraph)

- [x] Task 3.1: State Manager Persistente (backend/app/services/detour/state_manager.py)
  - Classe DetourStateManager
  - Metodo async get_satellite_state(satellite_id, tenant_id)
  - Metodo async update_satellite_state(satellite_id, tenant_id, updates)
  - Metodo async create_conjunction_analysis(conjunction_event_id, tenant_id)
  - Metodo async update_conjunction_analysis(analysis_id, updates)
  - Metodo async get_pending_conjunctions(tenant_id, risk_threshold="medium")
  - Metodo async save_maneuver_plan(analysis_id, plan_data)
  - Metodo async get_maneuver_history(satellite_id, tenant_id)
  - Usare async SQLAlchemy, gestire transazioni, logging operazioni

- [x] Task 3.2: Schema LangGraph State (backend/app/agents/detour/state.py)
  - Definire DetourGraphState TypedDict
  - Campi: session_id, tenant_id, satellite_id, conjunction_event_id
  - Campi: satellite_state, conjunction_data, screening_results, risk_assessment
  - Campi: maneuver_options, safety_review, ops_brief
  - Campi: current_agent, events, errors, completed
  - Type hints strict, documentare ogni campo

- [x] Task 3.3: Prompts System Agenti (backend/app/agents/detour/prompts.py)
  - SCOUT_PROMPT: screening congiunzioni, identificazione threats
  - ANALYST_PROMPT: calcolo Pc, risk assessment, geometria
  - PLANNER_PROMPT: design manovre, ottimizzazione timing
  - SAFETY_PROMPT: validazione safety, check vincoli
  - OPS_BRIEF_PROMPT: generazione riepilogo operativo
  - Ogni prompt: definire ruolo, task, output JSON strutturato, esempi
  - Temperature 0.2 per determinismo

- [x] Task 3.4: Tool Orbitali per Agenti (backend/app/agents/detour/tools.py)
  - @tool screen_conjunctions_tool(satellite_id, time_window_hours=72, threshold_km=5.0)
  - @tool assess_risk_tool(conjunction_event_id)
  - @tool propose_maneuvers_tool(conjunction_event_id, delta_v_budget=0.5)
  - @tool validate_maneuver_tool(maneuver_plan_id)
  - @tool execute_maneuver_tool(maneuver_plan_id)
  - Formattare output JSON per LLM, gestire errori gracefully

- [x] Task 3.5: Implementazione Nodi Grafo (backend/app/agents/detour/nodes.py)
  - Funzione scout_node(state, config): screening iniziale
  - Funzione analyst_node(state, config): risk analysis
  - Funzione planner_node(state, config): maneuver planning
  - Funzione safety_node(state, config): safety review
  - Funzione ops_brief_node(state, config): generazione brief
  - Ogni nodo: loggare evento inizio/fine, aggiornare state, emit eventi per SSE, gestire errori
  - Timeout 30s per nodo

- [x] Task 3.6: Costruzione Grafo LangGraph (backend/app/agents/detour/graph.py)
  - Funzione build_detour_graph() -> StateGraph
  - Nodi: scout, analyst, planner, safety, ops_brief
  - Archi condizionali basati su risk level, max 3 iterazioni planner-safety
  - Funzione async run_detour_pipeline(session_id, satellite_id, conjunction_event_id, tenant_id, state_manager)
  - Funzione async stream_detour_pipeline(...) -> AsyncGenerator[AgentEvent, None]
  - Testare routing condizionale, verificare loop detection

- [x] Task 3.7: Configurazione LLM Regolo.ai (backend/app/agents/detour/config.py)
  - Classe DetourLLMConfig
  - Modello: gpt-oss-120b (o da env), Base URL: https://api.regolo.ai/v1
  - Temperature: 0.2, Max tokens: 4096, Timeout: 60s
  - Metodo get_llm() -> ChatOpenAI
  - Metodo get_llm_with_tools(tools) -> ChatOpenAI
  - Gestire rate limiting

---

## FASE 4: Backend API e Servizi

- [x] Task 4.1: Servizio Collision Avoidance (backend/app/services/detour/collision_service.py)
  - Classe CollisionAvoidanceService
  - Metodo async trigger_conjunction_analysis(conjunction_event_id, tenant_id) -> str
  - Metodo async get_analysis_status(session_id) -> dict
  - Metodo async get_analysis_results(session_id) -> dict
  - Metodo async approve_maneuver_plan(plan_id, user_id) -> ManeuverPlan
  - Metodo async reject_maneuver_plan(plan_id, reason, user_id) -> ManeuverPlan
  - Metodo async execute_maneuver_plan(plan_id, user_id) -> dict
  - Integrare con AuditService, validare RBAC

- [x] Task 4.2: Schemas Pydantic (backend/app/schemas/detour.py)
  - Schema SatelliteStateSchema
  - Schema ConjunctionAnalysisRequest/Response
  - Schema ManeuverPlanSchema
  - Schema ManeuverApprovalRequest
  - Schema OpsBriefSchema
  - Schema AgentEventSchema (per SSE)
  - Schema ScreeningRequest/Response
  - Validazione strict con Field constraints

- [x] Task 4.3: Endpoint API Detour (backend/app/api/v1/detour.py)
  - POST /detour/conjunctions/{id}/analyze - trigger analisi
  - GET /detour/sessions/{id}/status - stato + SSE
  - GET /detour/sessions/{id}/results - risultati
  - POST /detour/maneuvers/{id}/approve - approva plan
  - POST /detour/maneuvers/{id}/reject - rifiuta plan
  - POST /detour/maneuvers/{id}/execute - esegui plan (admin only)
  - GET /detour/satellites/{id}/state - stato satellite
  - GET /detour/satellites/{id}/maneuvers - storico manovre
  - POST /detour/screening/run - screening manuale
  - RBAC: viewer/operator/admin, SSE: text/event-stream, Error RFC 7807

- [x] Task 4.4: Integration Router (backend/app/api/v1/router.py)
  - Aggiungere: from app.api.v1 import detour
  - Aggiungere: router.include_router(detour.router, prefix="/detour", tags=["detour"])
  - Verificare che tutti i router siano inclusi
  - Testare endpoint con curl/httpie

- [ ] Task 4.5: Integration Tests
  - backend/tests/agents/detour/test_graph.py: routing condizionale, loop detection, end-to-end
  - backend/tests/agents/detour/test_tools.py: chiamate tool, validazione output
  - backend/tests/api/v1/test_detour.py: success cases, auth failures, SSE streaming
  - Usare test database, mock LLM calls per velocità

---

## FASE 5: Frontend

- [ ] Task 5.1: API Client Detour (frontend/src/lib/api/detour.ts)
  - Funzione analyzeConjunction(conjunctionId) -> session_id
  - Funzione getAnalysisStatus(sessionId) -> status
  - Funzione subscribeToAnalysisStream(sessionId, onEvent) -> EventSource
  - Funzione getAnalysisResults(sessionId) -> results
  - Funzione approveManeuver(planId, notes)
  - Funzione rejectManeuver(planId, reason)
  - Funzione executeManeuver(planId)
  - Funzione getSatelliteState(satelliteId) -> state
  - Funzione runScreening(satelliteId, timeWindow) -> results
  - Gestione riconnessione SSE automatica, error handling con toast

- [ ] Task 5.2: Zustand Store (frontend/src/lib/store/detour.ts)
  - Store useDetourStore
  - State: activeAnalyses (Map), selectedSatellite, selectedConjunction
  - State: screeningResults, isLoading, error
  - Actions: startAnalysis, subscribeToSession
  - Actions: approveManeuver, rejectManeuver, executeManeuver
  - Actions: runScreening, selectSatellite, selectConjunction
  - Persistenza sessioni in localStorage, ottimistic updates

- [ ] Task 5.3: Componenti Detour (frontend/src/components/Detour/)
  - Componente DetourDashboard.tsx - layout principale
  - Componente CollisionAnalyzer.tsx - gauge risk, analisi dettaglio
  - Componente ManeuverPlanner.tsx - lista opzioni, comparazione
  - Componente ThreatList.tsx - tabella congiunzioni, filtri
  - Componente OrbitVisualizer.tsx - mini 3D preview
  - Componente AgentChat.tsx - eventi real-time
  - Componente OpsBriefPanel.tsx - riepilogo operativo
  - Props interfaces con suffix Props, functional components con hooks, Blueprint.js

- [ ] Task 5.4: Pagina Detour (frontend/src/app/(main)/detour/page.tsx)
  - Layout 2 colonne: sidebar (ThreatList) + main (tabs)
  - Tabs: Analysis, Maneuvers, History
  - Integrazione CesiumMap
  - Real-time SSE updates
  - 'use client' directive, error boundaries

- [ ] Task 5.5: Layer Cesium (frontend/src/components/CesiumMap/DetourLayer.tsx)
  - Marker congiunzioni sulla mappa
  - Linee approccio TCA
  - Heatmap risk level
  - Click handler per selezione
  - Integrare con CesiumViewer esistente
  - Performance: limitare entità visibili

- [ ] Task 5.6: Frontend Tests
  - frontend/src/lib/api/__tests__/detour.test.ts: mock fetch, SSE handling
  - frontend/src/components/Detour/__tests__/CollisionAnalyzer.test.tsx: rendering, user interactions
  - Vitest + React Testing Library, mock EventSource per SSE

---

## FASE 6: Testing Completo

- [ ] Task 6.1: Database Tests (backend/tests/db/test_detour_models.py)
  - Test CRUD satellite_state
  - Test FK constraints
  - Test maneuver plan workflow: proposed -> approved -> executed
  - Usare test database isolata

- [ ] Task 6.2: E2E Tests (backend/tests/e2e/test_detour_workflow.py)
  - Scenario 1 Complete Workflow: Screening -> Analysis -> Approve -> Execute
  - Scenario 2 Low Risk: Monitor only, no maneuver
  - Scenario 3 Concurrent: 3 analisi parallele stesso satellite
  - Setup: creare satellite test + TLE
  - Verificare: eventi SSE, stati DB, fuel update

- [ ] Task 6.3: Performance Tests (backend/tests/performance/test_detour_performance.py)
  - Test screening 1000 oggetti < 5s
  - Test pipeline latency < 30s (con LLM)
  - Test SSE delivery a 100 client
  - Test query history < 100ms
  - Usare pytest-benchmark, profilare con cProfile se necessario

- [ ] Task 6.4: Security Tests (backend/tests/security/test_detour_security.py)
  - Test cross-tenant isolation (404 non 403)
  - Test maneuver execution RBAC
  - Test SQL injection sanitization
  - Test SSE authentication
  - Test rate limiting (429)
  - Non leak info su esistenza risorse, tutti gli input validati

---

## FASE 7: Finalizzazione

- [ ] Task 7.1: Documentazione API
  - Aggiornare docstring e README
  - Aggiungere OpenAPI annotations
  - Aggiungere esempi request/response
  - Aggiungere guida integrazione
  - Swagger UI automatico da FastAPI

- [ ] Task 7.2: Configurazione Environment (.env.example)
  - Aggiungere DETOUR_ENABLED=true
  - Aggiungere DETOUR_SCREENING_THRESHOLD_KM=5.0
  - Aggiungere DETOUR_SCREENING_WINDOW_HOURS=72
  - Aggiungere DETOUR_MAX_ITERATIONS_PLANNER=3
  - Aggiungere DETOUR_AUTO_APPROVE_LOW_RISK=false
  - Aggiungere DETOUR_REGOLO_MODEL=gpt-oss-120b
  - Aggiungere DETOUR_REGOLO_TEMPERATURE=0.2
  - Non committare secrets

- [ ] Task 7.3: Monitoring Setup
  - Aggiungere metriche Prometheus: detour_analyses_total
  - Aggiungere metriche Prometheus: detour_analysis_duration_seconds
  - Aggiungere metriche Prometheus: detour_maneuvers_executed_total
  - Logging strutturato JSON
  - Context: session_id, tenant_id

---

## RIEPILOGO

**Totale task: 34**
- Fase 1: 4 task
- Fase 2: 5 task
- Fase 3: 7 task
- Fase 4: 5 task
- Fase 5: 6 task
- Fase 6: 4 task
- Fase 7: 3 task

---

## CHECKLIST FINALE

- [ ] Tutti i file creati secondo struttura
- [ ] Dipendenze installate
- [ ] Database migrato
- [ ] Unit tests passano (>90% coverage physics)
- [ ] Integration tests passano
- [ ] E2E tests passano
- [ ] Performance tests soddisfano requisiti
- [ ] Security tests passano
- [ ] API documentata
- [ ] Frontend funzionante
- [ ] SSE streaming testato
- [ ] RBAC verificato su tutti endpoint

---

**NOTE IMPORTANTI:**
- Seguire sempre AGENTS.md per convenzioni codice
- Type hints obbligatori
- Error handling con SDAException
- Logging con structlog
- RBAC su ogni endpoint
- Tests per ogni funzione >10 linee
- Componenti React functional con hooks
- API Client usare SWR, Zustand per stato globale
