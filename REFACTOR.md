# AURA Page Architecture Refactor

> Full-stack page consolidation plan for the SDA Platform.
> Goal: reduce navigation sprawl, eliminate duplication, maintain 100% functionality.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problems Identified](#2-problems-identified)
3. [Target Architecture](#3-target-architecture)
4. [Migration Matrix](#4-migration-matrix)
5. [Implementation Phases](#5-implementation-phases)
   - [Phase 1: Shared Utilities](#phase-1-shared-utilities)
   - [Phase 2: Extract Panel Components](#phase-2-extract-panel-components)
   - [Phase 3: Consolidate Pages](#phase-3-consolidate-pages)
   - [Phase 4: Update Sidebar](#phase-4-update-sidebar)
   - [Phase 5: Delete Orphaned Pages](#phase-5-delete-orphaned-pages)
   - [Phase 6: URL Redirects](#phase-6-url-redirects)
6. [File-by-File Changelog](#6-file-by-file-changelog)
7. [Component Dependency Map](#7-component-dependency-map)
8. [Shared Utility Specifications](#8-shared-utility-specifications)
9. [Backend Impact](#9-backend-impact)
10. [Testing Strategy](#10-testing-strategy)
11. [Rollback Plan](#11-rollback-plan)

---

## 1. Current State Analysis

### Page Inventory (17 routes)

| Route | File | LOC | Type | Sidebar | Description |
|---|---|---|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | 427 | Full page | CORE | KPIs, conjunctions, weather, incidents, quick actions |
| `/map` | `map/page.tsx` | ~2000 | Full page | CORE | 3D Cesium globe, satellite tracking, SSE streams |
| `/sandbox` | `sandbox/page.tsx` | 748 | Full page | CORE | Scenario builder, actor placement, AI chat |
| `/explorer` | `explorer/page.tsx` | 381 | Full page | CORE | Object catalog browser, satellite details |
| `/graph` | `graph/page.tsx` | 1156 | Full page | CORE | D3 network visualization, threat relationships |
| `/incidents` | `incidents/page.tsx` | 536 | Full page | OPERATIONS | Incident CRUD, assignment, AI chat |
| `/detour` | `detour/page.tsx` | ~2000 | Full page | OPERATIONS | Collision avoidance, multi-agent pipeline |
| `/operations` | `operations/page.tsx` | 21 | TabbedPage wrapper | OPERATIONS | Routes, formations, comms |
| `/threats` | `threats/page.tsx` | 24 | TabbedPage wrapper | INTELLIGENCE | Detection, fleet risk, adversary |
| `/events` | `events/page.tsx` | 24 | TabbedPage wrapper | INTELLIGENCE | Launches, reentry, maneuvers |
| `/environment` | `environment/page.tsx` | 22 | TabbedPage wrapper | INTELLIGENCE | Space weather, RF spectrum |
| `/admin` | `admin/page.tsx` | 280 | Full page | Hidden | System status, settings, maintenance |
| `/ingestion` | `ingestion/page.tsx` | 437 | Full page | Hidden | TLE upload, defense controls, quality |
| `/country-dashboard` | `country-dashboard/page.tsx` | 11 | Wrapper | Hidden | Per-country satellite statistics |

**Total: 17 routes, 11 sidebar links, 3 hidden pages, 4 thin wrappers (11-24 LOC)**

### Sidebar Navigation (current)

```
CORE (5 items)
  Dashboard        /dashboard
  Map              /map
  Sandbox          /sandbox
  Explorer         /explorer
  Graph            /graph

OPERATIONS (3 items)
  Incidents        /incidents
  Detour           /detour
  Operations       /operations

INTELLIGENCE (3 items)
  Threats & Intel  /threats
  Events           /events
  Environment      /environment
```

### Component Reuse Map

| Component | Used In |
|---|---|
| `AgentChat` | Detour page, Incidents page, Sandbox page |
| `ThreatPanel` | `/threats` (tab) |
| `FleetRiskPanel` | `/threats` (tab) |
| `AdversaryPanel` | `/threats` (tab) |
| `LaunchCorrelationPanel` | `/events` (tab) |
| `ReentryDashboard` | `/events` (tab) |
| `ManeuverDetectionPanel` | `/events` (tab) |
| `SpaceWeatherPanel` | `/environment` (tab) |
| `RFSpectrumPanel` | `/environment` (tab) |
| `OperationsDashboard` | `/operations` (tab) |
| `CommsPanel` | `/operations` (tab) |
| `DetourDashboard` | `/detour` (inline) |
| `CountryDashboard` | `/country-dashboard` (wrapper) |
| `TabbedPage` | threats, events, environment, operations pages |

### State Management

| Store | File | Used By |
|---|---|---|
| `useAppStore` | `lib/store/index.ts` | Sidebar, TopBar |
| `useDetourStore` | `lib/store/detour.ts` | DetourDashboard, ThreatList, CollisionAnalyzer, ManeuverPlanner, DetourAgentPanel |
| `useSandboxStore` | `lib/store/sandbox.ts` | SandboxContextPanel, SandboxChatPanel, sandbox page |
| `useSimulationStore` | `lib/store/simulation.ts` | CesiumMap layers, simulation components |

---

## 2. Problems Identified

### P1: Navigation Sprawl

11 sidebar items across 3 groups. Users must remember which of 3 intelligence pages has the data they need (threats vs events vs environment). Cognitive load is unnecessary when these are all "situational awareness feeds."

### P2: Thin Wrapper Pages (4 pages, 11-24 LOC each)

These files exist only to define tab arrays and pass them to `TabbedPage`:

```
threats/page.tsx       → 24 lines → TabbedPage(ThreatPanel, FleetRiskPanel, AdversaryPanel)
events/page.tsx        → 24 lines → TabbedPage(LaunchCorrelationPanel, ReentryDashboard, ManeuverDetectionPanel)
environment/page.tsx   → 22 lines → TabbedPage(SpaceWeatherPanel, RFSpectrumPanel)
operations/page.tsx    → 21 lines → TabbedPage(OperationsDashboard, CommsPanel)
```

Each one creates a separate route, a separate sidebar entry, and a separate mental slot for the user. They should be tabs within a parent page.

### P3: Domain Fragmentation

**Intelligence data split across 3 routes:**
- `/threats` = threat detection results
- `/events` = launches, reentry, maneuvers
- `/environment` = space weather, RF spectrum

These are all intelligence feeds. An operator checking situational awareness must navigate 3 separate pages.

**Object exploration split across 3 routes:**
- `/explorer` = satellite/station catalog
- `/graph` = network visualization of the same objects
- `/country-dashboard` = per-country view of the same objects

**Operations split across 3 routes:**
- `/incidents` = incident management
- `/detour` = collision avoidance
- `/operations` = routes, formations, comms

### P4: Duplicated Code Patterns

| Pattern | Occurrences | Files |
|---|---|---|
| `useCallback(() => api.fetch*) + useEffect + setInterval` polling | 8+ | ThreatPanel, FleetRiskPanel, ReentryDashboard, LaunchCorrelationPanel, CountryDashboard, OperationsDashboard, IncidentsPage, DashboardPage |
| Severity/risk color mapping | 6+ | ThreatPanel, IncidentsPage, DashboardPage, ReentryDashboard, LaunchCorrelationPanel, DetourDashboard |
| Error callout + retry button | 5+ | ThreatPanel, LaunchCorrelationPanel, ReentryDashboard, OperationsDashboard, IncidentsPage |
| Tab state management (`activeTab` + `setActiveTab`) | 5+ | ThreatPanel, LaunchCorrelationPanel, ReentryDashboard, OperationsDashboard, GraphPage |
| Sort state (`sortKey` + `sortDir` + toggle) | 3+ | CountryDashboard, ReentryDashboard, IncidentsPage |

### P5: Hidden/Orphaned Pages

`/admin`, `/ingestion`, and `/country-dashboard` are not in the sidebar. Users can only reach them via direct URL or internal links. This breaks discoverability.

### P6: Inconsistent Page Patterns

- Some pages are full 500+ LOC inline implementations (incidents, graph, dashboard)
- Some pages delegate to a single component (country-dashboard, detour)
- Some pages use TabbedPage (threats, events, environment, operations)
- No consistent rule for "when does something get its own route?"

---

## 3. Target Architecture

### 7 Routes, 7 Sidebar Items

```
CORE (4 sidebar items)
├── Dashboard       /dashboard
│   unchanged — KPI overview, quick actions
│
├── Map             /map
│   unchanged — 3D Cesium globe
│
├── Sandbox         /sandbox
│   unchanged — scenario simulation
│
└── Explorer        /explorer
    ABSORBS: /graph, /country-dashboard
    tabs: Catalog | Network Graph | Countries

OPERATIONS (1 sidebar item)
└── Operations      /operations
    ABSORBS: /incidents, /detour, old /operations
    tabs: Incidents | Detour | Routes & Formations | Communications

INTELLIGENCE (1 sidebar item)
└── Intelligence    /intelligence
    ABSORBS: /threats, /events, /environment
    tabs: Detection | Fleet Risk | Adversary | Launches | Reentry | Maneuvers | Space Weather | RF Spectrum

SYSTEM (1 sidebar item)
└── System          /system
    ABSORBS: /admin, /ingestion
    tabs: Status & Settings | Data Ingestion
```

### Sidebar (target)

```
CORE
  Dashboard        /dashboard        dashboard    --sda-accent-blue
  Map              /map              globe        --sda-accent-cyan
  Sandbox          /sandbox          build        #f59e0b
  Explorer         /explorer         search-around --sda-accent-green

OPERATIONS
  Operations       /operations       flows        --sda-accent-blue

INTELLIGENCE
  Intelligence     /intelligence     shield       #ff6b6b

SYSTEM
  System           /system           cog          --sda-text-secondary
```

### Decision Criteria

| Keep as standalone route? | Criteria |
|---|---|
| YES | Complex 3D/visualization page (Map, Sandbox) |
| YES | High-traffic entry point (Dashboard) |
| NO | Thin TabbedPage wrapper (<30 LOC) |
| NO | Views the same domain data as another page |
| NO | Hidden from sidebar (poor discoverability) |

---

## 4. Migration Matrix

| Before | After | Action |
|---|---|---|
| `/dashboard` | `/dashboard` | **No change** |
| `/map` | `/map` | **No change** |
| `/sandbox` | `/sandbox` | **No change** |
| `/explorer` | `/explorer?tab=catalog` | **Expand** — add tabs for graph + countries |
| `/graph` | `/explorer?tab=network` | **Redirect** — extract logic to `NetworkGraphPanel` |
| `/country-dashboard` | `/explorer?tab=countries` | **Redirect** — already a component |
| `/incidents` | `/operations?tab=incidents` | **Redirect** — extract logic to `IncidentPanel` |
| `/detour` | `/operations?tab=detour` | **Redirect** — `DetourDashboard` already extracted |
| `/operations` | `/operations?tab=routes` | **Expand** — add incidents + detour tabs |
| `/threats` | `/intelligence?tab=detection` | **Redirect** — panels already extracted |
| `/events` | `/intelligence?tab=launches` | **Redirect** — panels already extracted |
| `/environment` | `/intelligence?tab=weather` | **Redirect** — panels already extracted |
| `/admin` | `/system?tab=status` | **Redirect** — extract logic to `AdminPanel` |
| `/ingestion` | `/system?tab=ingestion` | **Redirect** — extract logic to `IngestionPanel` |

---

## 5. Implementation Phases

### Phase 1: Shared Utilities

> Zero page changes. Pure utility extraction. Safe to merge independently.

#### 1a. Create `usePollApi` hook

**File:** `frontend/src/hooks/usePollApi.ts`

Replaces the `useCallback + useEffect + setInterval` pattern found in 8+ components.

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollApiOptions {
  /** Polling interval in ms. 0 = no polling, fetch once. Default: 0 */
  interval?: number;
  /** Skip initial fetch. Default: false */
  skip?: boolean;
}

interface UsePollApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePollApi<T>(
  fetcher: () => Promise<T>,
  options: UsePollApiOptions = {}
): UsePollApiResult<T> {
  const { interval = 0, skip = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    refetch();
    if (interval > 0) {
      const id = setInterval(refetch, interval);
      return () => clearInterval(id);
    }
  }, [refetch, interval, skip]);

  return { data, loading, error, refetch };
}
```

**Components to migrate (Phase 1 or later):**

| Component | Current pattern | After |
|---|---|---|
| `ThreatPanel` | `useCallback + useEffect + setInterval(30s)` | `usePollApi(api.getProximityThreats, { interval: 30000 })` |
| `FleetRiskPanel` | `useCallback + useEffect` | `usePollApi(api.getFleetRiskCurrent)` |
| `ReentryDashboard` | `useCallback + useEffect` | `usePollApi(api.getReentryPredictions)` |
| `LaunchCorrelationPanel` | `useCallback + useEffect` | `usePollApi(api.getRecentLaunches)` |
| `CountryDashboard` | `useCallback + useEffect` | `usePollApi(api.getCountryStats)` |
| `OperationsDashboard` | `useCallback + useEffect` | `usePollApi(api.getOperations)` |

#### 1b. Create `ErrorState` component

**File:** `frontend/src/components/ErrorState.tsx`

Replaces the duplicated `Callout + retry button` pattern in 5+ components.

```typescript
'use client';

import { Callout, Button, Intent } from '@blueprintjs/core';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  intent?: Intent;
}

export function ErrorState({ message, onRetry, intent = Intent.DANGER }: ErrorStateProps) {
  return (
    <Callout intent={intent} icon="error" className="m-4">
      <p>{message}</p>
      {onRetry && (
        <Button
          small
          intent={intent}
          icon="refresh"
          onClick={onRetry}
          className="mt-2"
        >
          Retry
        </Button>
      )}
    </Callout>
  );
}
```

#### 1c. Consolidate severity utilities

**File:** `frontend/src/lib/severity.ts` (already exists, extend)

Ensure all severity/risk color functions live here. Add any missing:

```typescript
// Already present:
export function severityIntent(severity: string): Intent { /* ... */ }
export function severityColor(severity: string): string { /* ... */ }
export function severityHex(severity: string): string { /* ... */ }

// ADD if missing — used inline in ThreatPanel, Graph, Dashboard:
export function riskColor(level: 'critical' | 'high' | 'medium' | 'low'): string {
  const map: Record<string, string> = {
    critical: '#ff4d4f',
    high: '#ff7a45',
    medium: '#ffc53d',
    low: '#73d13d',
  };
  return map[level] ?? '#8c8c8c';
}

export function riskIntent(level: string): Intent {
  const map: Record<string, Intent> = {
    critical: Intent.DANGER,
    high: Intent.WARNING,
    medium: Intent.WARNING,
    low: Intent.SUCCESS,
  };
  return map[level] ?? Intent.NONE;
}
```

**Components to update:** replace inline `riskColor`/`severityColor` re-implementations with imports from `@/lib/severity`.

#### 1d. Create `useSortedData` hook

**File:** `frontend/src/hooks/useSortedData.ts`

```typescript
import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

export function useSortedData<T>(
  data: T[],
  defaultKey: keyof T,
  defaultDir: SortDir = 'asc'
) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}
```

---

### Phase 2: Extract Panel Components

> Extract inline page logic into reusable panel components. No route changes yet.

#### 2a. Extract `IncidentPanel`

**Source:** `frontend/src/app/(main)/incidents/page.tsx` (536 lines)
**Target:** `frontend/src/components/Incidents/IncidentPanel.tsx`

Steps:
1. Copy entire component body from `incidents/page.tsx`
2. Rename default export to `IncidentPanel`
3. Keep all internal state, dialogs, API calls as-is
4. Export as named export: `export function IncidentPanel()`
5. Update `incidents/page.tsx` to just render `<IncidentPanel />`
6. Verify page works identically

#### 2b. Extract `NetworkGraphPanel`

**Source:** `frontend/src/app/(main)/graph/page.tsx` (1156 lines)
**Target:** `frontend/src/components/Graph/NetworkGraphPanel.tsx`

Steps:
1. Copy entire component body from `graph/page.tsx`
2. Rename to `NetworkGraphPanel`
3. Accept optional `className` prop for container sizing
4. Keep all D3 logic, filtering, selection, auto-refresh as-is
5. Export as named export
6. Update `graph/page.tsx` to just render `<NetworkGraphPanel />`
7. Verify D3 rendering, zoom, selection all work

#### 2c. Extract `AdminPanel`

**Source:** `frontend/src/app/(main)/admin/page.tsx` (280 lines)
**Target:** `frontend/src/components/Admin/AdminPanel.tsx`

Steps:
1. Copy component body
2. Rename to `AdminPanel`
3. Keep all system stats, toggles, maintenance actions
4. Update `admin/page.tsx` to render `<AdminPanel />`

#### 2d. Extract `IngestionPanel`

**Source:** `frontend/src/app/(main)/ingestion/page.tsx` (437 lines)
**Target:** `frontend/src/components/Ingestion/IngestionPanel.tsx`

Steps:
1. Copy component body
2. Rename to `IngestionPanel`
3. Keep upload logic, defense controls, quality metrics
4. Update `ingestion/page.tsx` to render `<IngestionPanel />`

#### 2e. Extract `ExplorerPanel`

**Source:** `frontend/src/app/(main)/explorer/page.tsx` (381 lines)
**Target:** `frontend/src/components/Explorer/ExplorerPanel.tsx`

Steps:
1. Copy component body (the inner Suspense-wrapped component)
2. Rename to `ExplorerPanel`
3. Keep search, pagination, satellite detail, "View on Map" link
4. Update `explorer/page.tsx` to render `<ExplorerPanel />`

**After Phase 2, every page is a thin shell rendering a panel component. This makes Phase 3 trivial.**

---

### Phase 3: Consolidate Pages

> Merge thin shells into consolidated TabbedPage routes.

#### 3a. `/explorer/page.tsx` — Absorb Graph + Countries

```typescript
'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ExplorerPanel } from '@/components/Explorer/ExplorerPanel';
import { NetworkGraphPanel } from '@/components/Graph/NetworkGraphPanel';
import { CountryDashboard } from '@/components/CountryDashboard/CountryDashboard';

export default function ExplorerPage() {
  return (
    <TabbedPage
      tabs={[
        { id: 'catalog',   title: 'Catalog',       component: <ExplorerPanel /> },
        { id: 'network',   title: 'Network Graph', component: <NetworkGraphPanel /> },
        { id: 'countries', title: 'Countries',      component: <CountryDashboard /> },
      ]}
      icon="search-around"
      title="Explorer"
      color="var(--sda-accent-green)"
      tabsId="explorer"
    />
  );
}
```

#### 3b. `/operations/page.tsx` — Absorb Incidents + Detour

```typescript
'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { IncidentPanel } from '@/components/Incidents/IncidentPanel';
import { DetourDashboard } from '@/components/Detour/DetourDashboard';
import { OperationsDashboard } from '@/components/Operations/OperationsDashboard';
import { CommsPanel } from '@/components/Comms/CommsPanel';

export default function OperationsPage() {
  return (
    <TabbedPage
      tabs={[
        { id: 'incidents', title: 'Incidents',           component: <IncidentPanel /> },
        { id: 'detour',    title: 'Detour',              component: <DetourDashboard /> },
        { id: 'routes',    title: 'Routes & Formations', component: <OperationsDashboard /> },
        { id: 'comms',     title: 'Communications',      component: <CommsPanel /> },
      ]}
      icon="flows"
      title="Operations"
      color="var(--sda-accent-blue)"
      tabsId="operations"
    />
  );
}
```

#### 3c. `/intelligence/page.tsx` — New consolidated intelligence page

```typescript
'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ThreatPanel } from '@/components/Threats/ThreatPanel';
import { FleetRiskPanel } from '@/components/Threats/FleetRiskPanel';
import { AdversaryPanel } from '@/components/Adversary/AdversaryPanel';
import { LaunchCorrelationPanel } from '@/components/Launch/LaunchCorrelationPanel';
import { ReentryDashboard } from '@/components/Reentry/ReentryDashboard';
import { ManeuverDetectionPanel } from '@/components/ManeuverDetection/ManeuverDetectionPanel';
import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';
import { RFSpectrumPanel } from '@/components/RFSpectrum/RFSpectrumPanel';

export default function IntelligencePage() {
  return (
    <TabbedPage
      tabs={[
        { id: 'detection',  title: 'Detection',     component: <ThreatPanel /> },
        { id: 'fleet-risk', title: 'Fleet Risk',    component: <FleetRiskPanel /> },
        { id: 'adversary',  title: 'Adversary',     component: <AdversaryPanel /> },
        { id: 'launches',   title: 'Launches',      component: <LaunchCorrelationPanel /> },
        { id: 'reentry',    title: 'Reentry',       component: <ReentryDashboard /> },
        { id: 'maneuvers',  title: 'Maneuvers',     component: <ManeuverDetectionPanel /> },
        { id: 'weather',    title: 'Space Weather', component: <SpaceWeatherPanel /> },
        { id: 'rf',         title: 'RF Spectrum',   component: <RFSpectrumPanel /> },
      ]}
      icon="shield"
      title="Intelligence"
      color="#ff6b6b"
      tabsId="intelligence"
    />
  );
}
```

#### 3d. `/system/page.tsx` — New admin + ingestion page

```typescript
'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { AdminPanel } from '@/components/Admin/AdminPanel';
import { IngestionPanel } from '@/components/Ingestion/IngestionPanel';

export default function SystemPage() {
  return (
    <TabbedPage
      tabs={[
        { id: 'status',    title: 'Status & Settings', component: <AdminPanel /> },
        { id: 'ingestion', title: 'Data Ingestion',    component: <IngestionPanel /> },
      ]}
      icon="cog"
      title="System"
      color="var(--sda-text-secondary)"
      tabsId="system"
    />
  );
}
```

---

### Phase 4: Update Sidebar

**File:** `frontend/src/components/Layout/Sidebar.tsx`

Replace `navGroups` array:

```typescript
const navGroups: NavGroup[] = [
  {
    id: 'core',
    label: 'CORE',
    items: [
      { icon: 'dashboard',     label: 'Dashboard',    href: '/dashboard', colorVar: '--sda-accent-blue' },
      { icon: 'globe',         label: 'Map',          href: '/map',       colorVar: '--sda-accent-cyan' },
      { icon: 'build',         label: 'Sandbox',      href: '/sandbox',   colorVar: '#f59e0b' },
      { icon: 'search-around', label: 'Explorer',     href: '/explorer',  colorVar: '--sda-accent-green' },
    ],
  },
  {
    id: 'operations',
    label: 'OPERATIONS',
    items: [
      { icon: 'flows', label: 'Operations', href: '/operations', colorVar: '--sda-accent-blue' },
    ],
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    items: [
      { icon: 'shield', label: 'Intelligence', href: '/intelligence', colorVar: '#ff6b6b' },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      { icon: 'cog', label: 'System', href: '/system', colorVar: '--sda-text-secondary' },
    ],
  },
];
```

---

### Phase 5: Delete Orphaned Pages

Remove these page files (all functionality preserved in consolidated pages):

```
frontend/src/app/(main)/threats/page.tsx          → /intelligence?tab=detection
frontend/src/app/(main)/events/page.tsx           → /intelligence?tab=launches
frontend/src/app/(main)/environment/page.tsx      → /intelligence?tab=weather
frontend/src/app/(main)/incidents/page.tsx        → /operations?tab=incidents
frontend/src/app/(main)/graph/page.tsx            → /explorer?tab=network
frontend/src/app/(main)/country-dashboard/page.tsx → /explorer?tab=countries
frontend/src/app/(main)/admin/page.tsx            → /system?tab=status
frontend/src/app/(main)/ingestion/page.tsx        → /system?tab=ingestion
```

Also remove now-empty directories:

```
frontend/src/app/(main)/threats/
frontend/src/app/(main)/events/
frontend/src/app/(main)/environment/
frontend/src/app/(main)/incidents/
frontend/src/app/(main)/graph/
frontend/src/app/(main)/country-dashboard/
frontend/src/app/(main)/admin/
frontend/src/app/(main)/ingestion/
```

**Keep** `/detour/page.tsx` as a redirect (see Phase 6) since it may have deep links from agent sessions.

---

### Phase 6: URL Redirects

**File:** `frontend/next.config.js`

Add permanent redirects so bookmarks, agent-generated links, and external references continue to work:

```javascript
async redirects() {
  return [
    // Intelligence consolidation
    { source: '/threats',     destination: '/intelligence?tab=detection', permanent: true },
    { source: '/events',      destination: '/intelligence?tab=launches',  permanent: true },
    { source: '/environment', destination: '/intelligence?tab=weather',   permanent: true },

    // Operations consolidation
    { source: '/incidents',   destination: '/operations?tab=incidents',   permanent: true },
    { source: '/detour',      destination: '/operations?tab=detour',     permanent: true },

    // Explorer consolidation
    { source: '/graph',             destination: '/explorer?tab=network',    permanent: true },
    { source: '/country-dashboard', destination: '/explorer?tab=countries',  permanent: true },

    // System consolidation
    { source: '/admin',     destination: '/system?tab=status',    permanent: true },
    { source: '/ingestion', destination: '/system?tab=ingestion', permanent: true },
  ];
},
```

**Also update internal links:**

| File | Link to update |
|---|---|
| `dashboard/page.tsx` | "View all incidents" → `/operations?tab=incidents` |
| `dashboard/page.tsx` | Quick action "Create Incident" link → `/operations?tab=incidents` |
| `explorer/page.tsx` | "View on Map" stays as `/map?highlight=...` (no change) |
| `components/Chat/AgentChat.tsx` | Any hardcoded `/detour` links → `/operations?tab=detour` |
| `components/Layout/TopBar.tsx` | Search result navigation → update if routes referenced |

---

## 6. File-by-File Changelog

### New Files

| File | Phase | Purpose |
|---|---|---|
| `frontend/src/hooks/usePollApi.ts` | 1a | Shared API polling hook |
| `frontend/src/hooks/useSortedData.ts` | 1d | Shared sort state hook |
| `frontend/src/components/ErrorState.tsx` | 1b | Shared error UI component |
| `frontend/src/components/Incidents/IncidentPanel.tsx` | 2a | Extracted from incidents page |
| `frontend/src/components/Graph/NetworkGraphPanel.tsx` | 2b | Extracted from graph page |
| `frontend/src/components/Admin/AdminPanel.tsx` | 2c | Extracted from admin page |
| `frontend/src/components/Ingestion/IngestionPanel.tsx` | 2d | Extracted from ingestion page |
| `frontend/src/components/Explorer/ExplorerPanel.tsx` | 2e | Extracted from explorer page |
| `frontend/src/app/(main)/intelligence/page.tsx` | 3c | New consolidated intelligence page |
| `frontend/src/app/(main)/system/page.tsx` | 3d | New consolidated system page |

### Modified Files

| File | Phase | Change |
|---|---|---|
| `frontend/src/lib/severity.ts` | 1c | Add `riskColor()`, `riskIntent()` |
| `frontend/src/app/(main)/explorer/page.tsx` | 3a | Rewrite as TabbedPage with 3 tabs |
| `frontend/src/app/(main)/operations/page.tsx` | 3b | Rewrite as TabbedPage with 4 tabs |
| `frontend/src/components/Layout/Sidebar.tsx` | 4 | Update `navGroups` (11 → 7 items) |
| `frontend/next.config.js` | 6 | Add 9 redirect rules |
| `frontend/src/app/(main)/dashboard/page.tsx` | 6 | Update internal links |

### Deleted Files

| File | Phase | Replaced By |
|---|---|---|
| `frontend/src/app/(main)/threats/page.tsx` | 5 | `/intelligence?tab=detection` |
| `frontend/src/app/(main)/events/page.tsx` | 5 | `/intelligence?tab=launches` |
| `frontend/src/app/(main)/environment/page.tsx` | 5 | `/intelligence?tab=weather` |
| `frontend/src/app/(main)/incidents/page.tsx` | 5 | `/operations?tab=incidents` |
| `frontend/src/app/(main)/graph/page.tsx` | 5 | `/explorer?tab=network` |
| `frontend/src/app/(main)/country-dashboard/page.tsx` | 5 | `/explorer?tab=countries` |
| `frontend/src/app/(main)/admin/page.tsx` | 5 | `/system?tab=status` |
| `frontend/src/app/(main)/ingestion/page.tsx` | 5 | `/system?tab=ingestion` |
| `frontend/src/components/Detour/AgentChat.tsx` | — | Already deleted (git status shows `D`) |

---

## 7. Component Dependency Map

### After Refactor

```
/dashboard
└── (self-contained: KPI cards, dialogs, timeline)
    ├── ConjunctionAnalysisDialog
    ├── SpaceWeatherDialog
    ├── CreateIncidentDialog
    └── UploadTLEDialog

/map
└── (self-contained: Cesium viewer + 40 layers)
    ├── CesiumViewer
    ├── SatelliteLayer, HostileSatelliteLayer, ...
    ├── GroundStationLayer, MilitarySymbolLayer, ...
    ├── ThreatIndicatorLayer, CollisionHeatmapLayer, ...
    └── ItalyDefenseHUD

/sandbox
└── (self-contained: scenario builder)
    ├── CesiumViewer (dynamic)
    ├── SandboxActorLayer
    ├── SandboxChatPanel
    └── SandboxContextPanel

/explorer (TabbedPage)
├── tab:catalog   → ExplorerPanel (extracted from explorer/page.tsx)
├── tab:network   → NetworkGraphPanel (extracted from graph/page.tsx)
└── tab:countries → CountryDashboard (existing component)

/operations (TabbedPage)
├── tab:incidents → IncidentPanel (extracted from incidents/page.tsx)
│                   └── AgentChat (reused)
├── tab:detour    → DetourDashboard (existing component)
│                   ├── ThreatList
│                   ├── CollisionAnalyzer
│                   ├── ManeuverPlanner
│                   ├── OrbitVisualizer
│                   ├── OpsBriefPanel
│                   └── AgentChat (reused)
├── tab:routes    → OperationsDashboard (existing component)
└── tab:comms     → CommsPanel (existing component)

/intelligence (TabbedPage)
├── tab:detection  → ThreatPanel (existing)
├── tab:fleet-risk → FleetRiskPanel (existing)
├── tab:adversary  → AdversaryPanel (existing)
├── tab:launches   → LaunchCorrelationPanel (existing)
├── tab:reentry    → ReentryDashboard (existing)
├── tab:maneuvers  → ManeuverDetectionPanel (existing)
├── tab:weather    → SpaceWeatherPanel (existing)
└── tab:rf         → RFSpectrumPanel (existing)

/system (TabbedPage)
├── tab:status    → AdminPanel (extracted from admin/page.tsx)
└── tab:ingestion → IngestionPanel (extracted from ingestion/page.tsx)
```

### Store Dependencies (unchanged)

```
useAppStore       → Sidebar, TopBar
useDetourStore    → DetourDashboard tree (now under /operations?tab=detour)
useSandboxStore   → Sandbox page tree (unchanged)
useSimulationStore → Map page Cesium layers (unchanged)
```

---

## 8. Shared Utility Specifications

### Hook: `usePollApi<T>(fetcher, options)`

```
Input:  fetcher: () => Promise<T>
        options: { interval?: number, skip?: boolean }
Output: { data: T | null, loading: boolean, error: string | null, refetch: () => void }
```

- First fetch on mount (unless `skip: true`)
- Re-fetches on `interval` if > 0
- Cleans up interval on unmount
- Stable `refetch` reference via `useCallback`
- Ref-tracks `fetcher` to avoid stale closures

### Hook: `useSortedData<T>(data, defaultKey, defaultDir)`

```
Input:  data: T[], defaultKey: keyof T, defaultDir: 'asc' | 'desc'
Output: { sorted: T[], sortKey: keyof T, sortDir: 'asc'|'desc', toggleSort: (key) => void }
```

- Memoized sort via `useMemo`
- Click same column toggles direction
- Click different column resets to `asc`

### Component: `ErrorState`

```
Props:  message: string, onRetry?: () => void, intent?: Intent
Render: Blueprint Callout with error icon + optional retry button
```

### Utility: `riskColor(level)` / `riskIntent(level)`

```
Input:  'critical' | 'high' | 'medium' | 'low'
Output: hex color string / Blueprint Intent
```

Lives in `frontend/src/lib/severity.ts` alongside existing `severityIntent`, `severityColor`, `severityHex`.

---

## 9. Backend Impact

### No backend changes required

The backend API structure is unaffected. All endpoints remain the same:
- `/api/v1/threats/*`, `/api/v1/fleet-risk/*`, `/api/v1/adversary/*` — still called by same panel components
- `/api/v1/incidents/*` — still called by IncidentPanel
- `/api/v1/detour/*` — still called by DetourDashboard
- `/api/v1/launch-correlation/*`, `/api/v1/reentry/*` — still called by same panels
- `/api/v1/sandbox/*` — unchanged
- `/api/v1/ai/*` — unchanged

### SSE streams

SSE client endpoints (`/api/v1/ai/chat/stream`, `/api/v1/ai/chat/orchestrate`) are not route-dependent. They work the same regardless of which page hosts the component.

### Detour agent sessions

Agent sessions store `session_id` references, not frontend routes. The step-by-step approval flow (`DetourAgentPanel`) works via store state, not URL. No impact.

---

## 10. Testing Strategy

### Phase 1 Tests (Shared Utilities)

```
frontend/src/hooks/__tests__/usePollApi.test.ts
  ✓ fetches on mount
  ✓ does not fetch when skip=true
  ✓ polls at interval
  ✓ cleans up interval on unmount
  ✓ sets error on fetch failure
  ✓ refetch resets error and loading

frontend/src/hooks/__tests__/useSortedData.test.ts
  ✓ sorts ascending by default
  ✓ toggles direction on same column
  ✓ resets to asc on new column

frontend/src/components/__tests__/ErrorState.test.tsx
  ✓ renders message
  ✓ renders retry button when onRetry provided
  ✓ calls onRetry on click
```

### Phase 2 Tests (Panel Extraction)

For each extracted panel, verify it renders identically:

```
frontend/src/components/Incidents/__tests__/IncidentPanel.test.tsx
  ✓ renders incident list
  ✓ opens create dialog
  ✓ filters by status/severity

frontend/src/components/Graph/__tests__/NetworkGraphPanel.test.tsx
  ✓ renders SVG canvas
  ✓ loads node/edge data

(similar for AdminPanel, IngestionPanel, ExplorerPanel)
```

### Phase 3 Tests (Consolidated Pages)

```
frontend/src/app/(main)/explorer/__tests__/page.test.tsx
  ✓ renders Catalog tab by default
  ✓ switches to Network Graph tab
  ✓ switches to Countries tab
  ✓ reads ?tab= from URL
  ✓ updates URL on tab change

frontend/src/app/(main)/operations/__tests__/page.test.tsx
  ✓ renders Incidents tab by default
  ✓ switches to Detour tab
  ✓ switches to Routes tab
  ✓ switches to Comms tab

frontend/src/app/(main)/intelligence/__tests__/page.test.tsx
  ✓ renders Detection tab by default
  ✓ all 8 tabs switch correctly
  ✓ URL query param persistence works

frontend/src/app/(main)/system/__tests__/page.test.tsx
  ✓ renders Status tab by default
  ✓ switches to Ingestion tab
```

### Phase 6 Tests (Redirects)

```
Manual / E2E verification:
  ✓ /threats       → /intelligence?tab=detection
  ✓ /events        → /intelligence?tab=launches
  ✓ /environment   → /intelligence?tab=weather
  ✓ /incidents     → /operations?tab=incidents
  ✓ /detour        → /operations?tab=detour
  ✓ /graph         → /explorer?tab=network
  ✓ /country-dashboard → /explorer?tab=countries
  ✓ /admin         → /system?tab=status
  ✓ /ingestion     → /system?tab=ingestion
```

---

## 11. Rollback Plan

Each phase is independently deployable and reversible:

| Phase | Rollback |
|---|---|
| Phase 1 (shared utils) | Delete new files. No other files changed. |
| Phase 2 (extract panels) | Revert panel files. Page files still have original logic. |
| Phase 3 (consolidate pages) | Revert page files to pre-consolidation. Restore old thin wrappers. |
| Phase 4 (sidebar) | Revert `Sidebar.tsx` to original `navGroups`. |
| Phase 5 (delete pages) | `git checkout` the deleted page files. |
| Phase 6 (redirects) | Remove redirect entries from `next.config.js`. |

**Recommended deploy order:** Phase 1 → 2 → 3+4+5+6 (ship consolidation as one atomic change).

---

## Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Routes | 17 | 7 | -10 |
| Sidebar items | 11 | 7 | -4 |
| Hidden pages | 3 | 0 | -3 |
| Thin wrapper pages (< 30 LOC) | 5 | 0 | -5 |
| Duplicated polling patterns | 8+ | 0 | extracted to `usePollApi` |
| Duplicated error patterns | 5+ | 0 | extracted to `ErrorState` |
| Duplicated color logic | 6+ | 0 | consolidated in `severity.ts` |
| Panel components modified | — | 0 | all panels stay as-is |
| Backend changes | — | 0 | no API changes |
| Functionality lost | — | 0 | everything preserved |
