/* Detour API client
   Provides convenience functions for the Detour collision‑avoidance subsystem.
   Mirrors the backend endpoints defined in backend/app/api/v1/detour.py.
*/

import { getApiBase } from '@/lib/utils';

// Base API URL – matches the logic used in src/lib/api.ts
const API_BASE: string = getApiBase();

// Default tenant – in a real app this would be dynamic based on auth context.
const DEFAULT_TENANT_ID = 'default';

/** Helper to perform a fetch request with JSON handling and proper headers. */
async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': DEFAULT_TENANT_ID,
    ...(init.headers ?? {}),
  } as Record<string, string>;

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const isDeprecated = Boolean(errBody?.deprecated) || response.status === 501;
    const baseMessage = errBody.detail || errBody.title || `API error: ${response.status}`;
    const message = isDeprecated
      ? `Feature temporarily disabled: ${baseMessage}`
      : baseMessage;
    throw new Error(message);
  }
  // Some endpoints return no body (e.g., DELETE). Guard against empty responses.
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** Types matching the backend schemas. */
export interface DetourAnalysisStatus {
  session_id: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  events?: DetourAnalysisEvent[];
}

export interface DetourAnalysisEvent {
  type?: string;
  agent?: string;
  message?: string;
  content?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface DetourAnalysisResults {
  session_id: string;
  status: string;
  output_data: Record<string, unknown>;
}

export interface SatelliteState {
  id: string;
  satellite_id: string;
  fuel_remaining_kg?: number;
  delta_v_budget_m_s?: number;
}

export interface ManeuverPlan {
  id: string;
  conjunction_analysis_id: string;
  maneuver_type: string;
  delta_v_m_s?: number;
  fuel_cost_kg?: number;
  execution_window?: Record<string, unknown>;
  expected_miss_distance_km?: number;
  risk_reduction_percent?: number;
  status: string;
  ai_recommendation?: Record<string, unknown>;
  approved_by?: string;
  executed_at?: string;
}

export interface ScreeningCandidate {
  candidate_id: string;
  satellite_id: string;
  satellite_name?: string;
  satellite_norad_id?: number;
  tca: string;
  miss_distance_km: number;
  collision_probability?: number;
  risk_level?: string;
}

export interface ScreeningResult {
  candidates: ScreeningCandidate[];
  generated_at: string;
  metadata?: {
    source?: string;
    requested_satellite_id?: string;
    screened_satellite_name?: string;
    screened_satellite_norad_id?: number;
    screened_with_requested_satellite?: boolean;
    screened_orbit_id?: string | null;
    [key: string]: unknown;
  };
}

/** Trigger a Detour analysis for a specific conjunction event.
 *  Returns the newly created session identifier. */
export async function analyzeConjunction(conjunctionId: string): Promise<string> {
  const url = `${API_BASE}/api/v1/detour/conjunctions/${encodeURIComponent(conjunctionId)}/analyze`;
  const data = await fetchJson<{ session_id: string }>(url, { method: 'POST' });
  return data.session_id;
}

/** Retrieve the current status of an analysis session. */
export async function getAnalysisStatus(sessionId: string): Promise<DetourAnalysisStatus> {
  const url = `${API_BASE}/api/v1/detour/sessions/${encodeURIComponent(sessionId)}/status`;
  return fetchJson<DetourAnalysisStatus>(url);
}

/** Subscribe to an EventSource stream that emits status updates for a session.
 *  The backend currently returns JSON via a regular GET endpoint, but the
 *  client treats it as an SSE stream for forward compatibility.
 *  The function automatically reconnects on errors.
 */
export function subscribeToAnalysisStream(
  sessionId: string,
  onEvent: (event: MessageEvent) => void
): EventSource {
  const url = `${API_BASE}/api/v1/detour/sessions/${encodeURIComponent(sessionId)}/status`;
  let es: EventSource | null = null;
  const connect = () => {
    es = new EventSource(url);
    es.onmessage = onEvent;
    es.onerror = () => {
      // Clean up and attempt reconnection after a short delay.
      es?.close();
      setTimeout(connect, 3000);
    };
  };
  connect();
  // Return the EventSource so callers can close it when done.
  return es as unknown as EventSource;
}

/** Retrieve the final results of a completed analysis session. */
export async function getAnalysisResults(sessionId: string): Promise<DetourAnalysisResults> {
  const url = `${API_BASE}/api/v1/detour/sessions/${encodeURIComponent(sessionId)}/results`;
  return fetchJson<DetourAnalysisResults>(url);
}

/** Approve a proposed maneuver plan. */
export async function approveManeuver(planId: string, notes?: string): Promise<ManeuverPlan> {
  const url = `${API_BASE}/api/v1/detour/maneuvers/${encodeURIComponent(planId)}/approve`;
  const body = notes ? { notes } : {};
  return fetchJson<ManeuverPlan>(url, { method: 'POST', body: JSON.stringify(body) });
}

/** Reject a proposed maneuver plan, providing a reason. */
export async function rejectManeuver(planId: string, reason: string): Promise<ManeuverPlan> {
  const url = `${API_BASE}/api/v1/detour/maneuvers/${encodeURIComponent(planId)}/reject`;
  return fetchJson<ManeuverPlan>(url, { method: 'POST', body: JSON.stringify({ reason }) });
}

/** Execute an approved maneuver plan. */
export async function executeManeuver(planId: string): Promise<Record<string, unknown>> {
  const url = `${API_BASE}/api/v1/detour/maneuvers/${encodeURIComponent(planId)}/execute`;
  return fetchJson<Record<string, unknown>>(url, { method: 'POST' });
}

/** Get the Detour‑specific state for a satellite. */
export async function getSatelliteState(satelliteId: string): Promise<SatelliteState> {
  const url = `${API_BASE}/api/v1/detour/satellites/${encodeURIComponent(satelliteId)}/state`;
  return fetchJson<SatelliteState>(url);
}

/** Run a manual conjunction screening operation for a satellite.
 *  timeWindowHours and thresholdKm default to the values defined in the
 *  backend schema (72 h and 5 km respectively).
 */
export async function runScreening(
  satelliteId: string,
  timeWindowHours: number = 72,
  thresholdKm: number = 5.0
): Promise<ScreeningResult> {
  const url = `${API_BASE}/api/v1/detour/screening/run`;
  const payload = {
    satellite_id: satelliteId,
    time_window_hours: timeWindowHours,
    threshold_km: thresholdKm,
  };
  return fetchJson<ScreeningResult>(url, { method: 'POST', body: JSON.stringify(payload) });
}

// Export a reusable instance if callers prefer a class‑style API.
export const detourApi = {
  analyzeConjunction,
  getAnalysisStatus,
  subscribeToAnalysisStream,
  getAnalysisResults,
  approveManeuver,
  rejectManeuver,
  executeManeuver,
  getSatelliteState,
  runScreening,
  // Step-by-step functions
  startStepByStep,
  executeAgentStep,
  approveAgentStep,
  rejectAgentStep,
  getSessionStatus,
  getNextStep,
};

/* ==========================================================================
   Step-by-step Pipeline API
   ========================================================================== */

export type ExecutionMode = 'auto' | 'step_by_step';
export type StepStatus = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'rejected' | 'error';

export interface StepByStepRequest {
  conjunction_event_id: string;
  satellite_id: string;
  execution_mode: ExecutionMode;
}

export interface AgentStepInfo {
  agent_name: string;
  step_number: number;
  status: StepStatus;
  output_summary?: string;
  cesium_actions?: CesiumAction[];
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
}

export interface StepSessionResponse {
  session_id: string;
  conjunction_event_id: string;
  satellite_id: string;
  execution_mode: ExecutionMode;
  status: string;
  current_agent?: string;
  current_step_number?: number;
  steps?: AgentStepInfo[];
  cesium_actions?: CesiumAction[];
  final_ops_brief?: Record<string, unknown>;
  final_risk_level?: string;
  started_at?: string;
  completed_at?: string;
}

export interface StepExecutionResponse {
  session_id: string;
  agent_name: string;
  step_number: number;
  status: StepStatus;
  output_summary: string;
  cesium_actions?: CesiumAction[];
  next_step_available: boolean;
  next_agent?: string;
  message: string;
}

export interface CesiumAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface NextStepResponse {
  available: boolean;
  agent_name?: string;
  step_number?: number;
  status?: StepStatus;
  output_summary?: string;
  cesium_actions?: CesiumAction[];
  message?: string;
}

/** Start a new step-by-step Detour analysis session.
 *  Immediately executes the Scout agent and returns the session.
 */
export async function startStepByStep(
  conjunctionEventId: string,
  satelliteId: string,
  executionMode: ExecutionMode = 'step_by_step'
): Promise<StepSessionResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/start`;
  const payload: StepByStepRequest = {
    conjunction_event_id: conjunctionEventId,
    satellite_id: satelliteId,
    execution_mode: executionMode,
  };
  return fetchJson<StepSessionResponse>(url, { method: 'POST', body: JSON.stringify(payload) });
}

/** Execute a specific agent step. */
export async function executeAgentStep(
  sessionId: string,
  agentName: string
): Promise<StepExecutionResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(agentName)}/execute`;
  return fetchJson<StepExecutionResponse>(url, { method: 'POST' });
}

/** Approve the current agent step. */
export async function approveAgentStep(
  sessionId: string,
  agentName: string,
  notes?: string
): Promise<StepSessionResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(agentName)}/approve`;
  const body = notes ? { notes } : {};
  return fetchJson<StepSessionResponse>(url, { method: 'POST', body: JSON.stringify(body) });
}

/** Reject the current agent step. */
export async function rejectAgentStep(
  sessionId: string,
  agentName: string,
  reason: string
): Promise<StepSessionResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(agentName)}/reject`;
  return fetchJson<StepSessionResponse>(url, { method: 'POST', body: JSON.stringify({ reason }) });
}

/** Get the complete status of a step-by-step session. */
export async function getSessionStatus(sessionId: string): Promise<StepSessionResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/sessions/${encodeURIComponent(sessionId)}`;
  return fetchJson<StepSessionResponse>(url);
}

/** Get the next available step for execution. */
export async function getNextStep(sessionId: string): Promise<NextStepResponse> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/sessions/${encodeURIComponent(sessionId)}/next`;
  return fetchJson<NextStepResponse>(url);
}

/* ==========================================================================
   Archive API
   ========================================================================== */

export interface ArchivedAnalysis {
  id: string;
  session_id: string;
  conjunction_event_id: string;
  satellite_id: string;
  satellite_name?: string;
  status: string;
  final_risk_level?: string;
  was_executed: boolean;
  executed_at?: string;
  created_at?: string;
  completed_at?: string;
  steps_summary?: Array<{
    agent: string;
    status: string;
    output_summary?: string;
  }>;
}

export interface ArchiveListResponse {
  items: ArchivedAnalysis[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ArchivedAnalysisDetail extends ArchivedAnalysis {
  recommended_maneuver?: Record<string, unknown>;
}

/** List archived analyses with pagination and filters. */
export async function listArchivedAnalyses(
  page: number = 1,
  limit: number = 20,
  satelliteId?: string,
  riskLevel?: string
): Promise<ArchiveListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (satelliteId) params.set('satellite_id', satelliteId);
  if (riskLevel) params.set('risk_level', riskLevel);
  
  const url = `${API_BASE}/api/v1/ai/agents/detour/archive?${params}`;
  return fetchJson<ArchiveListResponse>(url);
}

/** Get detailed information about a specific archived analysis. */
export async function getArchivedAnalysis(analysisId: string): Promise<ArchivedAnalysisDetail> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/archive/${encodeURIComponent(analysisId)}`;
  return fetchJson<ArchivedAnalysisDetail>(url);
}

/** Start a new analysis based on an archived one. */
export async function reanalyzeArchived(analysisId: string): Promise<{
  message: string;
  new_session_id: string;
  archived_session_id: string;
}> {
  const url = `${API_BASE}/api/v1/ai/agents/detour/archive/${encodeURIComponent(analysisId)}/reanalyze`;
  return fetchJson<{
    message: string;
    new_session_id: string;
    archived_session_id: string;
  }>(url, { method: 'POST' });
}
