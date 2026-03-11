'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  Button,
  Callout,
  Card,
  Icon,
  NonIdealState,
  ProgressBar,
  Spinner,
  Tag,
} from '@blueprintjs/core';
import { api, type ConjunctionEvent, type SatelliteDetail } from '@/lib/api';
import {
  analyzeConjunction,
  getAnalysisResults,
  getAnalysisStatus,
  getSatelliteState,
  runScreening,
  type DetourAnalysisEvent,
  type DetourAnalysisResults,
  type DetourAnalysisStatus,
  type SatelliteState,
  type ScreeningResult,
} from '@/lib/api/detour';

type SatelliteLookup = Record<string, SatelliteDetail>;

const PANEL_STYLE = {
  backgroundColor: 'var(--sda-bg-secondary)',
  border: '1px solid var(--sda-border-default)',
  boxShadow: 'none',
};

const HERO_STYLE = {
  ...PANEL_STYLE,
  background:
    'linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(249, 115, 22, 0.12)), var(--sda-bg-secondary)',
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unexpected error';
}

function riskRank(riskLevel?: string | null): number {
  switch ((riskLevel ?? '').toLowerCase()) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function compareConjunctions(left: ConjunctionEvent, right: ConjunctionEvent): number {
  const riskDelta = riskRank(right.risk_level) - riskRank(left.risk_level);
  if (riskDelta !== 0) {
    return riskDelta;
  }

  const scoreDelta = (right.risk_score ?? 0) - (left.risk_score ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return new Date(left.tca).getTime() - new Date(right.tca).getTime();
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatCountdown(value?: string | null): string {
  if (!value) {
    return 'No TCA';
  }

  const deltaMs = new Date(value).getTime() - Date.now();
  const absHours = Math.abs(deltaMs) / 3_600_000;

  if (absHours < 1) {
    const minutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60_000));
    return deltaMs >= 0 ? `in ${minutes} min` : `${minutes} min ago`;
  }

  if (absHours < 24) {
    return deltaMs >= 0 ? `in ${absHours.toFixed(1)} h` : `${absHours.toFixed(1)} h ago`;
  }

  const days = absHours / 24;
  return deltaMs >= 0 ? `in ${days.toFixed(1)} d` : `${days.toFixed(1)} d ago`;
}

function formatDistance(km?: number | null): string {
  if (typeof km !== 'number' || Number.isNaN(km)) {
    return 'Unknown';
  }

  if (km < 1) {
    return `${(km * 1000).toFixed(0)} m`;
  }

  return `${km.toFixed(3)} km`;
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Unknown';
  }

  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 2)}%`;
}

function riskIntent(riskLevel?: string | null): 'danger' | 'warning' | 'success' | 'primary' | 'none' {
  switch ((riskLevel ?? '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'success';
    default:
      return 'none';
  }
}

function statusIntent(status?: string | null): 'danger' | 'warning' | 'success' | 'primary' | 'none' {
  switch ((status ?? '').toLowerCase()) {
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'danger';
    case 'running':
    case 'active':
      return 'warning';
    case 'completed':
      return 'success';
    case 'pending':
      return 'primary';
    default:
      return 'none';
  }
}

function displaySatelliteName(satelliteId: string, lookup: SatelliteLookup): string {
  return lookup[satelliteId]?.name ?? satelliteId.slice(0, 8);
}

function displaySatelliteMeta(satelliteId: string, lookup: SatelliteLookup): string {
  const satellite = lookup[satelliteId];
  if (!satellite) {
    return satelliteId;
  }

  return `NORAD ${satellite.norad_id}`;
}

function extractAgentOutputs(
  status: DetourAnalysisStatus | null,
  results: DetourAnalysisResults | null
): Record<string, string> {
  const output: Record<string, string> = {};
  const structured = results?.output_data ?? {};

  for (const key of ['ops_brief', 'scout_output', 'analyst_output', 'planner_output', 'safety_output']) {
    const value = structured[key];
    if (typeof value === 'string' && value.trim()) {
      output[key] = value.trim();
    }
  }

  for (const event of status?.events ?? []) {
    if (event.type !== 'agent_output' || typeof event.content !== 'string' || !event.content.trim()) {
      continue;
    }

    if (event.agent === 'ops_brief') {
      output.ops_brief = output.ops_brief ?? event.content.trim();
    } else if (event.agent) {
      output[`${event.agent}_output`] = output[`${event.agent}_output`] ?? event.content.trim();
    }
  }

  return output;
}

function progressFromAnalysis(status: DetourAnalysisStatus | null, outputs: Record<string, string>): number {
  const normalized = (status?.status ?? '').toLowerCase();
  if (normalized === 'completed' || normalized === 'failed' || normalized === 'cancelled') {
    return 1;
  }

  const outputCount = ['scout_output', 'analyst_output', 'planner_output', 'safety_output', 'ops_brief'].filter(
    (key) => Boolean(outputs[key])
  ).length;
  const eventCount = status?.events?.length ?? 0;
  return Math.min(0.9, 0.14 + outputCount * 0.16 + Math.min(eventCount, 8) * 0.05);
}

function agentOutputTitle(key: string): string {
  switch (key) {
    case 'scout_output':
      return 'Scout';
    case 'analyst_output':
      return 'Analyst';
    case 'planner_output':
      return 'Planner';
    case 'safety_output':
      return 'Safety';
    default:
      return 'Output';
  }
}

function eventHeadline(event: DetourAnalysisEvent): string {
  if (event.type === 'agent_start') {
    return `${event.agent ?? 'Agent'} started`;
  }
  if (event.type === 'agent_output') {
    return `${event.agent ?? 'Agent'} delivered output`;
  }
  if (event.type === 'pipeline_complete') {
    return 'Pipeline complete';
  }
  if (event.type === 'error') {
    return 'Pipeline error';
  }
  if (typeof event.message === 'string' && event.message.trim()) {
    return event.message.trim();
  }
  return event.type ?? 'Event';
}

function eventBody(event: DetourAnalysisEvent): string | null {
  if (typeof event.content === 'string' && event.content.trim()) {
    return event.content.trim();
  }
  if (typeof event.message === 'string' && event.message.trim()) {
    return event.message.trim();
  }
  return null;
}

function eventIcon(event: DetourAnalysisEvent): string {
  switch (event.type) {
    case 'agent_start':
      return 'play';
    case 'agent_output':
      return 'endorsed';
    case 'pipeline_complete':
      return 'tick-circle';
    case 'error':
      return 'error';
    default:
      return 'dot';
  }
}

function recommendationFor(
  conjunction: ConjunctionEvent | null,
  outputs: Record<string, string>,
  screening: ScreeningResult | null
): string {
  if (!conjunction) {
    return 'Select a conjunction from the queue to generate an operator brief.';
  }

  if (outputs.ops_brief) {
    return outputs.ops_brief;
  }

  const risk = conjunction.risk_level.toLowerCase();
  const actionable = conjunction.is_actionable;
  const screeningCount = screening?.candidates.length ?? 0;

  if (risk === 'critical' || (actionable && risk === 'high')) {
    return 'Immediate operator review is required. Run the upstream analysis and validate whether the primary asset needs a maneuver recommendation before TCA.';
  }

  if (screeningCount > 0) {
    return `Manual screening found ${screeningCount} candidate approaches. Review the shortest miss distance object first, then decide whether to escalate into a full Detour analysis.`;
  }

  return 'Use the analysis run to generate a multi-agent ops brief, then compare that output against the manual screening candidates before making a maneuver call.';
}

export default function DetourPage() {
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState<string | null>(null);
  const [satelliteLookup, setSatelliteLookup] = useState<SatelliteLookup>({});
  const satelliteLookupRef = useRef<SatelliteLookup>({});

  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [lastQueueRefresh, setLastQueueRefresh] = useState<string | null>(null);

  const [satelliteState, setSatelliteState] = useState<SatelliteState | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<DetourAnalysisStatus | null>(null);
  const [analysisResults, setAnalysisResults] = useState<DetourAnalysisResults | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);

  satelliteLookupRef.current = satelliteLookup;

  const selectedConjunction =
    conjunctions.find((item) => item.id === selectedConjunctionId) ?? conjunctions[0] ?? null;
  const primarySatellite = selectedConjunction
    ? satelliteLookup[selectedConjunction.primary_object_id]
    : undefined;
  const secondarySatellite = selectedConjunction
    ? satelliteLookup[selectedConjunction.secondary_object_id]
    : undefined;

  const analysisOutputs = extractAgentOutputs(analysisStatus, analysisResults);
  const analysisProgress = progressFromAnalysis(analysisStatus, analysisOutputs);
  const queueActionableCount = conjunctions.filter((item) => item.is_actionable).length;
  const queueUrgentCount = conjunctions.filter((item) => {
    const deltaMs = new Date(item.tca).getTime() - Date.now();
    return deltaMs > 0 && deltaMs <= 24 * 3_600_000;
  }).length;

  async function hydrateSatelliteDetails(satelliteIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(satelliteIds)].filter(
      (satelliteId) => satelliteId && !satelliteLookupRef.current[satelliteId]
    );
    if (uniqueIds.length === 0) {
      return;
    }

    const settled = await Promise.allSettled(uniqueIds.map((satelliteId) => api.getSatellite(satelliteId)));
    const nextLookup: SatelliteLookup = {};

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        nextLookup[uniqueIds[index]] = result.value;
      }
    });

    if (Object.keys(nextLookup).length > 0) {
      startTransition(() => {
        setSatelliteLookup((current) => ({ ...current, ...nextLookup }));
      });
    }
  }

  async function loadConjunctionQueue(): Promise<void> {
    setQueueLoading(true);
    setQueueError(null);

    try {
      const response = await api.getConjunctions({ page: 1, page_size: 18 });
      const prioritized = [...response.items].sort(compareConjunctions);

      await hydrateSatelliteDetails(
        prioritized.flatMap((item) => [item.primary_object_id, item.secondary_object_id])
      );

      startTransition(() => {
        setConjunctions(prioritized);
        setSelectedConjunctionId((current) => {
          if (current && prioritized.some((item) => item.id === current)) {
            return current;
          }
          return prioritized[0]?.id ?? null;
        });
        setLastQueueRefresh(new Date().toISOString());
      });
    } catch (error) {
      setQueueError(normalizeError(error));
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    void loadConjunctionQueue();
    const intervalId = window.setInterval(() => {
      void loadConjunctionQueue();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!selectedConjunction) {
      setSatelliteState(null);
      setStateError(null);
      return;
    }

    let cancelled = false;
    setStateLoading(true);
    setStateError(null);
    setScreeningResult(null);
    setScreeningError(null);
    setAnalysisSessionId(null);
    setAnalysisStatus(null);
    setAnalysisResults(null);
    setAnalysisError(null);
    setAnalysisLoading(false);

    void hydrateSatelliteDetails([
      selectedConjunction.primary_object_id,
      selectedConjunction.secondary_object_id,
    ]);

    async function loadSatelliteState(): Promise<void> {
      try {
        const state = await getSatelliteState(selectedConjunction.primary_object_id);
        if (!cancelled) {
          setSatelliteState(state);
        }
      } catch (error) {
        const message = normalizeError(error);
        if (!cancelled) {
          if (
            message.toLowerCase().includes('not found') ||
            message.includes('DetourSatelliteState')
          ) {
            setSatelliteState(null);
          } else {
            setStateError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setStateLoading(false);
        }
      }
    }

    void loadSatelliteState();

    return () => {
      cancelled = true;
    };
  }, [selectedConjunction?.id]);

  useEffect(() => {
    if (!analysisSessionId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const status = await getAnalysisStatus(analysisSessionId);
        if (cancelled) {
          return;
        }

        setAnalysisStatus(status);

        if (status.status === 'completed') {
          const results = await getAnalysisResults(analysisSessionId);
          if (!cancelled) {
            setAnalysisResults(results);
            setAnalysisLoading(false);
            setAnalysisError(null);
          }
          return;
        }

        if (status.status === 'failed' || status.status === 'cancelled') {
          const failureEvent = [...(status.events ?? [])]
            .reverse()
            .find((event) => event.type === 'error' && typeof event.message === 'string');
          if (!cancelled) {
            setAnalysisLoading(false);
            if (failureEvent?.message) {
              setAnalysisError(failureEvent.message);
            }
          }
          return;
        }

        timeoutId = window.setTimeout(poll, 1500);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAnalysisError(normalizeError(error));
        timeoutId = window.setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [analysisSessionId]);

  async function handleRunAnalysis(): Promise<void> {
    if (!selectedConjunction) {
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisStatus(null);
    setAnalysisResults(null);

    try {
      const sessionId = await analyzeConjunction(selectedConjunction.id);
      setAnalysisSessionId(sessionId);
    } catch (error) {
      setAnalysisLoading(false);
      setAnalysisError(normalizeError(error));
    }
  }

  async function handleRunScreening(): Promise<void> {
    if (!selectedConjunction) {
      return;
    }

    setScreeningLoading(true);
    setScreeningError(null);

    try {
      const result = await runScreening(selectedConjunction.primary_object_id, 72, 5);
      setScreeningResult(result);
    } catch (error) {
      setScreeningError(normalizeError(error));
    } finally {
      setScreeningLoading(false);
    }
  }

  if (queueLoading && conjunctions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!queueLoading && conjunctions.length === 0) {
    return (
      <div className="h-full overflow-auto p-4">
        <NonIdealState
          icon="flows"
          title="No conjunctions available"
          description="The Detour queue is empty. Refresh once ontology conjunction events are available."
          action={
            <Button icon="refresh" onClick={() => void loadConjunctionQueue()}>
              Refresh queue
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 28%), radial-gradient(circle at top right, rgba(249, 115, 22, 0.1), transparent 24%)',
      }}
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
        <Card style={HERO_STYLE}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag intent="primary" minimal>
                  DETOUR
                </Tag>
                <span className="text-xs text-sda-text-secondary">
                  Multi-agent conjunction response console
                </span>
              </div>

              <div>
                <h1 className="text-3xl font-semibold text-sda-text-primary">Detour operator console</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-sda-text-secondary">
                  Prioritize conjunctions, launch the upstream Detour pipeline, watch live agent output,
                  and cross-check the selected primary asset with a manual screening pass.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Queue</div>
                  <div className="mt-1 text-2xl font-semibold text-sda-text-primary">{conjunctions.length}</div>
                  <div className="text-xs text-sda-text-secondary">ranked conjunctions</div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Actionable</div>
                  <div className="mt-1 text-2xl font-semibold text-sda-text-primary">{queueActionableCount}</div>
                  <div className="text-xs text-sda-text-secondary">requiring operator attention</div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <div className="text-xs uppercase tracking-wide text-sda-text-secondary">TCA &lt; 24h</div>
                  <div className="mt-1 text-2xl font-semibold text-sda-text-primary">{queueUrgentCount}</div>
                  <div className="text-xs text-sda-text-secondary">near-term conjunctions</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 xl:min-w-[260px]">
              <Button icon="refresh" onClick={() => void loadConjunctionQueue()} loading={queueLoading}>
                Refresh queue
              </Button>
              <Button
                icon="predictive-analysis"
                intent="primary"
                onClick={() => void handleRunAnalysis()}
                disabled={!selectedConjunction}
                loading={analysisLoading}
              >
                {analysisSessionId ? 'Re-run analysis' : 'Run detour analysis'}
              </Button>
              <Button
                icon="search-template"
                onClick={() => void handleRunScreening()}
                disabled={!selectedConjunction}
                loading={screeningLoading}
              >
                Run 72h manual screening
              </Button>
              <div className="pt-1 text-right text-xs text-sda-text-secondary">
                Last queue refresh: {formatTimestamp(lastQueueRefresh)}
              </div>
            </div>
          </div>
        </Card>

        {queueError ? (
          <Callout icon="warning-sign" intent="warning" title="Queue refresh warning">
            {queueError}
          </Callout>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1.45fr)_minmax(340px,1fr)]">
          <Card style={PANEL_STYLE} className="h-fit">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-sda-text-primary">Prioritized queue</h2>
                <p className="text-xs text-sda-text-secondary">Highest risk, then nearest TCA</p>
              </div>
              <Tag minimal>{conjunctions.length}</Tag>
            </div>

            <div className="space-y-2">
              {conjunctions.map((item) => {
                const selected = item.id === selectedConjunction?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedConjunctionId(item.id);
                    }}
                    className="w-full rounded-lg border p-3 text-left transition-colors"
                    style={{
                      borderColor: selected ? 'var(--sda-accent-blue)' : 'var(--sda-border-default)',
                      backgroundColor: selected ? 'var(--sda-bg-tertiary)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Tag intent={riskIntent(item.risk_level) as any}>{item.risk_level.toUpperCase()}</Tag>
                      <span className="text-xs text-sda-text-secondary">{formatCountdown(item.tca)}</span>
                    </div>
                    <div className="mt-3">
                      <div className="font-medium text-sda-text-primary">
                        {displaySatelliteName(item.primary_object_id, satelliteLookup)}
                      </div>
                      <div className="text-xs text-sda-text-secondary">
                        {displaySatelliteMeta(item.primary_object_id, satelliteLookup)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-sda-text-secondary">
                      vs {displaySatelliteName(item.secondary_object_id, satelliteLookup)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-sda-text-secondary">Miss distance</span>
                      <span className="font-medium text-sda-text-primary">
                        {formatDistance(item.miss_distance_km)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-sda-text-secondary">Risk score</span>
                      <span className="font-medium text-sda-text-primary">
                        {typeof item.risk_score === 'number' ? item.risk_score.toFixed(1) : 'Unscored'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-4">
            <Card style={PANEL_STYLE}>
              {selectedConjunction ? (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag intent={riskIntent(selectedConjunction.risk_level) as any}>
                          {selectedConjunction.risk_level.toUpperCase()}
                        </Tag>
                        <Tag minimal intent={selectedConjunction.is_actionable ? 'warning' : 'none'}>
                          {selectedConjunction.is_actionable ? 'ACTIONABLE' : 'MONITOR'}
                        </Tag>
                        {analysisSessionId ? (
                          <Tag minimal intent={statusIntent(analysisStatus?.status) as any}>
                            {analysisStatus?.status ?? 'session started'}
                          </Tag>
                        ) : null}
                      </div>

                      <div>
                        <h2 className="text-2xl font-semibold text-sda-text-primary">
                          {primarySatellite?.name ?? displaySatelliteName(selectedConjunction.primary_object_id, satelliteLookup)}
                        </h2>
                        <p className="mt-1 text-sm text-sda-text-secondary">
                          Primary asset against{' '}
                          {secondarySatellite?.name ??
                            displaySatelliteName(selectedConjunction.secondary_object_id, satelliteLookup)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border px-3 py-2 text-right" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Conjunction ID</div>
                      <div className="mt-1 font-mono text-sm text-sda-text-primary">
                        {selectedConjunction.id.slice(0, 8)}...
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Risk score</div>
                      <div className="mt-1 text-xl font-semibold text-sda-text-primary">
                        {typeof selectedConjunction.risk_score === 'number'
                          ? selectedConjunction.risk_score.toFixed(1)
                          : 'Unscored'}
                      </div>
                      <ProgressBar
                        className="mt-2"
                        intent={riskIntent(selectedConjunction.risk_level) as any}
                        value={
                          typeof selectedConjunction.risk_score === 'number'
                            ? Math.max(0.05, Math.min(1, selectedConjunction.risk_score / 100))
                            : Math.min(1, riskRank(selectedConjunction.risk_level) / 4)
                        }
                      />
                    </div>

                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Miss distance</div>
                      <div className="mt-1 text-xl font-semibold text-sda-text-primary">
                        {formatDistance(selectedConjunction.miss_distance_km)}
                      </div>
                      <div className="mt-1 text-xs text-sda-text-secondary">
                        Collision probability {formatPercent(selectedConjunction.collision_probability)}
                      </div>
                    </div>

                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Time of closest approach</div>
                      <div className="mt-1 text-xl font-semibold text-sda-text-primary">
                        {formatTimestamp(selectedConjunction.tca)}
                      </div>
                      <div className="mt-1 text-xs text-sda-text-secondary">{formatCountdown(selectedConjunction.tca)}</div>
                    </div>

                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Session progress</div>
                      <div className="mt-1 text-xl font-semibold text-sda-text-primary">
                        {analysisSessionId ? (analysisStatus?.status ?? 'starting') : 'idle'}
                      </div>
                      <ProgressBar
                        className="mt-2"
                        intent={statusIntent(analysisStatus?.status) as any}
                        value={analysisSessionId ? analysisProgress : 0}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <Callout
                      icon="endorsed"
                      intent={riskIntent(selectedConjunction.risk_level) as any}
                      title="Operator brief"
                    >
                      {recommendationFor(selectedConjunction, analysisOutputs, screeningResult)}
                    </Callout>

                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Objects in play</div>
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="font-medium text-sda-text-primary">
                            {primarySatellite?.name ??
                              displaySatelliteName(selectedConjunction.primary_object_id, satelliteLookup)}
                          </div>
                          <div className="text-xs text-sda-text-secondary">
                            {primarySatellite ? `NORAD ${primarySatellite.norad_id}` : selectedConjunction.primary_object_id}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-sda-text-primary">
                            {secondarySatellite?.name ??
                              displaySatelliteName(selectedConjunction.secondary_object_id, satelliteLookup)}
                          </div>
                          <div className="text-xs text-sda-text-secondary">
                            {secondarySatellite
                              ? `NORAD ${secondarySatellite.norad_id}`
                              : selectedConjunction.secondary_object_id}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </Card>

            <Card style={PANEL_STYLE}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-sda-text-primary">Agent outputs</h2>
                  <p className="text-xs text-sda-text-secondary">
                    Upstream Detour pipeline outputs surfaced as soon as they arrive
                  </p>
                </div>
                {analysisSessionId ? (
                  <Tag minimal intent={statusIntent(analysisStatus?.status) as any}>
                    Session {analysisSessionId.slice(0, 8)}
                  </Tag>
                ) : null}
              </div>

              {analysisError ? (
                <Callout icon="error" intent="danger" title="Analysis warning">
                  {analysisError}
                </Callout>
              ) : null}

              {!analysisSessionId && !analysisLoading ? (
                <NonIdealState
                  icon="predictive-analysis"
                  title="No analysis started"
                  description="Launch the Detour pipeline for the selected conjunction to generate the scout, analyst, planner, safety, and ops-brief outputs."
                  action={
                    <Button intent="primary" icon="play" onClick={() => void handleRunAnalysis()}>
                      Start analysis
                    </Button>
                  }
                />
              ) : null}

              {analysisLoading && !analysisStatus ? (
                <div className="flex items-center gap-3 rounded-lg border p-4" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <Spinner size={20} />
                  <div>
                    <div className="font-medium text-sda-text-primary">Starting analysis session</div>
                    <div className="text-xs text-sda-text-secondary">
                      The upstream agent graph is being queued for this conjunction.
                    </div>
                  </div>
                </div>
              ) : null}

              {analysisSessionId ? (
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {['scout_output', 'analyst_output', 'planner_output', 'safety_output'].map((key) => (
                      <div
                        key={key}
                        className="rounded-lg border p-3"
                        style={{ borderColor: 'var(--sda-border-default)' }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Icon icon="endorsed" size={12} className="text-sda-text-secondary" />
                          <span className="text-sm font-medium text-sda-text-primary">
                            {agentOutputTitle(key)}
                          </span>
                        </div>
                        <div className="text-sm leading-6 text-sda-text-secondary">
                          {analysisOutputs[key] || 'Awaiting agent output.'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {analysisResults?.output_data.error ? (
                    <Callout icon="warning-sign" intent="danger" title="Pipeline error">
                      {String(analysisResults.output_data.error)}
                    </Callout>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card style={PANEL_STYLE}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-sda-text-primary">Primary asset state</h2>
                  <p className="text-xs text-sda-text-secondary">
                    Ontology detail plus Detour-specific resource state when available
                  </p>
                </div>
                {primarySatellite ? <Tag minimal>{primarySatellite.norad_id}</Tag> : null}
              </div>

              {selectedConjunction ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                    <div className="font-medium text-sda-text-primary">
                      {primarySatellite?.name ?? displaySatelliteName(selectedConjunction.primary_object_id, satelliteLookup)}
                    </div>
                    <div className="mt-1 text-xs text-sda-text-secondary">
                      {primarySatellite?.country || 'Country unavailable'}
                      {primarySatellite?.operator ? ` · ${primarySatellite.operator}` : ''}
                    </div>
                    {primarySatellite?.tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {primarySatellite.tags.slice(0, 4).map((tag) => (
                          <Tag key={tag} minimal>
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Latest TLE epoch</div>
                      <div className="mt-1 text-sm font-medium text-sda-text-primary">
                        {formatTimestamp(primarySatellite?.latest_orbit?.epoch)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Orbit source</div>
                      <div className="mt-1 text-sm font-medium text-sda-text-primary">
                        {primarySatellite?.latest_orbit?.source ?? 'Unavailable'}
                      </div>
                    </div>
                  </div>

                  {stateLoading ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                      <Spinner size={18} />
                      <span className="text-sm text-sda-text-secondary">Loading Detour state...</span>
                    </div>
                  ) : null}

                  {stateError ? (
                    <Callout icon="warning-sign" intent="warning" title="State lookup warning">
                      {stateError}
                    </Callout>
                  ) : null}

                  {satelliteState ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                        <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Fuel remaining</div>
                        <div className="mt-1 text-lg font-semibold text-sda-text-primary">
                          {typeof satelliteState.fuel_remaining_kg === 'number'
                            ? `${satelliteState.fuel_remaining_kg.toFixed(2)} kg`
                            : 'Unknown'}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                        <div className="text-xs uppercase tracking-wide text-sda-text-secondary">Delta-v budget</div>
                        <div className="mt-1 text-lg font-semibold text-sda-text-primary">
                          {typeof satelliteState.delta_v_budget_m_s === 'number'
                            ? `${satelliteState.delta_v_budget_m_s.toFixed(2)} m/s`
                            : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!stateLoading && !stateError && !satelliteState ? (
                    <Callout icon="info-sign" title="No Detour state record">
                      No persistent Detour resource record exists yet for this satellite. Screening and analysis still use the ontology satellite detail and latest TLE.
                    </Callout>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card style={PANEL_STYLE}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-sda-text-primary">Manual screening</h2>
                  <p className="text-xs text-sda-text-secondary">
                    72-hour upstream screening against the selected primary asset
                  </p>
                </div>
                {screeningResult ? <Tag minimal>{screeningResult.candidates.length} candidates</Tag> : null}
              </div>

              {screeningError ? (
                <Callout icon="error" intent="danger" title="Screening warning">
                  {screeningError}
                </Callout>
              ) : null}

              {screeningLoading ? (
                <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <Spinner size={18} />
                  <span className="text-sm text-sda-text-secondary">Running manual screening...</span>
                </div>
              ) : null}

              {screeningResult?.metadata ? (
                <div className="mb-3 rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--sda-border-default)' }}>
                  <div className="text-sda-text-secondary">Screened asset</div>
                  <div className="mt-1 font-medium text-sda-text-primary">
                    {screeningResult.metadata.screened_satellite_name ?? 'Unknown asset'}
                  </div>
                  <div className="mt-1 text-sda-text-secondary">
                    {screeningResult.metadata.screened_with_requested_satellite
                      ? 'Using selected satellite latest TLE'
                      : 'Fell back to upstream demo satellite state'}
                  </div>
                </div>
              ) : null}

              {screeningResult && screeningResult.candidates.length === 0 ? (
                <Callout icon="clean" intent="success" title="No candidates inside threshold">
                  No conjunction candidates crossed the 5 km threshold in the 72-hour screening window.
                </Callout>
              ) : null}

              {screeningResult?.candidates.length ? (
                <div className="space-y-2">
                  {screeningResult.candidates.slice(0, 6).map((candidate) => (
                    <div
                      key={candidate.candidate_id}
                      className="rounded-lg border p-3"
                      style={{ borderColor: 'var(--sda-border-default)' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-sda-text-primary">
                            {candidate.satellite_name ?? `NORAD ${candidate.satellite_norad_id ?? candidate.satellite_id}`}
                          </div>
                          <div className="mt-1 text-xs text-sda-text-secondary">
                            {formatTimestamp(candidate.tca)} · {formatCountdown(candidate.tca)}
                          </div>
                        </div>
                        <Tag intent={riskIntent(candidate.risk_level) as any}>
                          {(candidate.risk_level ?? 'unknown').toUpperCase()}
                        </Tag>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-sda-text-secondary">Miss distance</div>
                          <div className="font-medium text-sda-text-primary">
                            {formatDistance(candidate.miss_distance_km)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sda-text-secondary">Collision probability</div>
                          <div className="font-medium text-sda-text-primary">
                            {formatPercent(candidate.collision_probability)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!screeningResult && !screeningLoading ? (
                <NonIdealState
                  icon="search-template"
                  title="Screening not run"
                  description="Use the manual screening pass to compare the selected primary asset against the upstream debris catalog before or after a full Detour analysis."
                  action={
                    <Button icon="search-template" onClick={() => void handleRunScreening()}>
                      Run screening
                    </Button>
                  }
                />
              ) : null}
            </Card>

            <Card style={PANEL_STYLE}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-sda-text-primary">Live timeline</h2>
                  <p className="text-xs text-sda-text-secondary">
                    Session events emitted by the upstream multi-agent graph
                  </p>
                </div>
                {analysisStatus ? (
                  <Tag minimal intent={statusIntent(analysisStatus.status) as any}>
                    {analysisStatus.status}
                  </Tag>
                ) : null}
              </div>

              {!analysisStatus?.events?.length ? (
                <NonIdealState
                  icon="timeline-events"
                  title="No timeline events yet"
                  description="The timeline fills as soon as the Detour pipeline emits agent and completion events."
                />
              ) : (
                <div className="max-h-[540px] space-y-3 overflow-auto pr-1">
                  {analysisStatus.events.map((event, index) => (
                    <div
                      key={`${event.type ?? 'event'}-${event.timestamp ?? index}-${index}`}
                      className="rounded-lg border p-3"
                      style={{ borderColor: 'var(--sda-border-default)' }}
                    >
                      <div className="flex items-start gap-3">
                        <Icon
                          icon={eventIcon(event) as any}
                          size={14}
                          className={event.type === 'error' ? 'text-red-400' : 'text-sda-text-secondary'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-sda-text-primary">{eventHeadline(event)}</div>
                            <span className="text-xs text-sda-text-secondary">
                              {typeof event.timestamp === 'number'
                                ? formatTimestamp(new Date(event.timestamp * 1000).toISOString())
                                : `#${index + 1}`}
                            </span>
                          </div>
                          {eventBody(event) ? (
                            <div className="mt-2 text-sm leading-6 text-sda-text-secondary">
                              {eventBody(event)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
