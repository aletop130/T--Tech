# Ralph Tasks - Debris Visualization on Map (keanucz/detour inspired)

> **Reference Repository:** https://github.com/keanucz/detour
> **Target Location:** `frontend/src/app/(main)/map/`
> **Backend Integration:** `backend/app/api/v1/ontology.py`
> **Comando check:** Dopo ogni task, eseguire test/check pertinenti
> **Marker completamento:** Stampare `READY_FOR_NEXT_TASK` quando un task è finito, `COMPLETE` quando tutti i task sono completati

---

## Overview (Based on keanucz/detour Architecture)

Implement debris visualization on the 3D Cesium map inspired by the TreeHacks 2026 "Detour" project. The approach uses:
- **React Three Fiber** (@react-three/fiber) for 3D rendering
- **InstancedMesh** for performant rendering of thousands of debris objects
- **Real-time orbital animation** with trail visualization
- **Orange/amber color scheme** (#f59e0b) for debris
- **Speed controls** for animation playback
- **Periodic debris updates** (15-second refresh cycle)

**Key Difference from keanucz/detour:** We use Cesium.js instead of React Three Fiber for Earth visualization, but adopt their debris rendering patterns.

---

## FASE 1: Backend API (Foundation)

- [x] Task 1.1: Create Debris Service (`backend/app/services/debris.py`)
  - Create `DebrisService` class following keanucz/detour patterns:
    - `list_debris(tenant_id, page, page_size, orbit_classes="LEO")` - list debris objects
    - `get_debris_batch(tenant_id, limit=2500)` - optimized for visualization
    - `get_debris_with_orbits(tenant_id)` - get all debris with TLE data
  - Debris objects use `satellites` table with `object_type='debris'`
  - Filter by orbit classes (LEO, MEO, GEO) like keanucz/detour
  - Add type hints, structured logging with structlog

- [x] Task 1.2: Add Debris API Endpoints (`backend/app/api/v1/ontology.py`)
  - Add `GET /api/debris` endpoint following keanucz/detour spec:
    ```python
    # Response format from keanucz/detour:
    {
      "timeUtc": "2026-01-01T00:00:00Z",
      "objects": [
        {
          "noradId": 12345,
          "lat": 51.5,
          "lon": -0.1,
          "altKm": 408.0
        }
      ]
    }
    ```
  - Add `GET /debris/with-orbits` endpoint for visualization
  - Support query params: `limit`, `orbitClasses`
  - Add RBAC checks using `get_current_user`

- [x] Task 1.3: Add Orbit Propagation Endpoint (`backend/app/api/v1/ontology.py`)
  - Add `GET /api/orbit` endpoint (keanucz/detour style):
    ```python
    # Response format:
    {
      "noradId": 25544,
      "timeStartUtc": "2026-01-01T00:00:00Z",
      "stepSec": 60,
      "points": [
        {"tUtc": "...", "lat": 51.5, "lon": -0.1, "altKm": 408.0}
      ]
    }
    ```
  - Parameters: `norad`, `minutes` (default 180), `stepSec` (default 60)
  - Use existing physics engine from `app/physics/propagator.py`

- [x] Task 1.4: Unit Tests - Backend (`backend/tests/api/v1/test_debris.py`)
  - Test `GET /api/debris` returns correct format
  - Test orbit propagation accuracy
  - Test LEO/MEO/GEO filtering
  - Test tenant isolation
  - Coverage > 90%

---

## FASE 2: Frontend Types & API Client

- [x] Task 2.1: Add Debris Types (`frontend/src/lib/types/debris.ts`)
  - Create types following keanucz/detour:
    ```typescript
    export interface DebrisObject {
      noradId: number;
      lat: number;
      lon: number;
      altKm: number;
    }
    
    export interface DebrisResponse {
      timeUtc: string;
      objects: DebrisObject[];
    }
    
    export interface OrbitPoint {
      tUtc: string;
      lat: number;
      lon: number;
      altKm: number;
    }
    
    export interface OrbitResponse {
      noradId: number;
      timeStartUtc: string;
      stepSec: number;
      points: OrbitPoint[];
    }
    
    export interface OrbitTrackState {
      points: Cartesian3[];
      timeStartMs: number;
      stepSec: number;
    }
    ```

- [x] Task 2.2: Add Debris API Methods (`frontend/src/lib/api/debris.ts`)
  - Create dedicated debris API module:
    ```typescript
    export async function getDebris(
      limit: number = 2500,
      orbitClasses: string = "LEO"
    ): Promise<DebrisResponse>;
    
    export async function getOrbit(
      noradId: number,
      minutes: number = 180,
      stepSec: number = 60
    ): Promise<OrbitResponse>;
    ```
  - Implement 15-second refresh cycle like keanucz/detour
  - Error handling with exponential backoff

- [x] Task 2.3: Unit Tests - API Client (`frontend/src/lib/api/__tests__/debris.test.ts`)
  - Test API methods with mocked fetch
  - Test refresh cycle logic
  - Test error handling

---

## FASE 3: Cesium Debris Layer (keanucz/detour Style)

- [x] Task 3.1: Create Debris Instanced Renderer (`frontend/src/components/CesiumMap/DebrisInstancedLayer.tsx`)
  - Use Cesium's `Primitive` with `GeometryInstance` for performance (similar to keanucz's InstancedMesh):
    ```typescript
    interface DebrisInstancedLayerProps {
      viewer: Viewer | null;
      debris: DebrisObject[];
      maxDisplayObjects?: number; // 2500 like keanucz
      refreshIntervalMs?: number; // 15000 like keanucz
      simTimeRef?: React.RefObject<number>;
      showDebris?: boolean;
    }
    ```
  - Visual styling (keanucz/detour colors):
    - Debris color: `#f59e0b` (orange/amber)
    - Point size: scale based on screen space (adaptive)
    - Transparent: opacity 0.9
  - Implement drift animation during simulation:
    - Slow linear drift + oscillation
    - Per-debris drift vectors (pseudo-random)
    - Update in requestAnimationFrame loop
  - Cleanup on unmount (remove primitives)

- [x] Task 3.2: Create Orbital Track Renderer (`frontend/src/components/CesiumMap/OrbitalTrackLayer.tsx`)
  - Props:
    ```typescript
    interface OrbitalTrackLayerProps {
      viewer: Viewer | null;
      orbitTrack: OrbitTrackState;
      trailFraction?: number; // 0.20 like keanucz (show 20% of orbit)
      minTrailPoints?: number; // 10
      color?: string;
      lineWidth?: number;
      isManual?: boolean;
      maneuverStartMs?: number;
    }
    ```
  - Render orbit trail as Cesium `Polyline`:
    - Show ~20% of orbit as visible trail arc (keanucz style)
    - Trail: some points behind satellite, rest ahead
    - Color: `#7dd3fc` (cyan) for auto, `#10b981` (green) for manual
    - Animate color to red (`#ef4444`) during maneuver
  - Maneuver animation (keanucz style):
    - 0→0.3s: ramp to red
    - 0.3→2.5s: hold red
    - 2.5→3.5s: fade back

- [x] Task 3.3: Create Moving Satellite Marker (`frontend/src/components/CesiumMap/MovingSatelliteMarker.tsx`)
  - Props:
    ```typescript
    interface MovingSatelliteMarkerProps {
      viewer: Viewer | null;
      orbitTrack: OrbitTrackState;
      isManual?: boolean;
      maneuverStartMs?: number;
      damping?: number; // 0.08 like keanucz
    }
    ```
  - Render as Cesium `Entity` (point/billboard):
    - Sphere geometry: radius based on scale
    - Color: `#22d3ee` (cyan) for auto, `#10b981` (green) for manual
    - Animate position along orbit using lerp
    - Apply damping for smooth movement
    - Maneuver animation: color shift + scale pulse
  - Use `viewer.clock.onTick` for animation loop

- [x] Task 3.4: Create DebrisInfoCard Component (`frontend/src/components/CesiumMap/DebrisInfoCard.tsx`)
  - Props: `debris: DebrisObject`, `onClose: () => void`
  - Blueprint.js Card with:
    - Trash/scatter-plot icon (debris indicator)
    - NORAD ID, position (lat/lon/alt)
    - Orbit class (LEO/MEO/GEO)
    - Last updated timestamp
  - Close button
  - Style consistently with existing info cards

- [x] Task 3.5: Unit Tests - Debris Components (`frontend/src/components/CesiumMap/__tests__/DebrisInstancedLayer.test.tsx`)
  - Test primitive creation
  - Test debris count limit
  - Test cleanup on unmount
  - Mock Cesium viewer

---

## FASE 4: Map Page Integration (keanucz/detour Style)

- [x] Task 4.1: Add Debris State (`frontend/src/app/(main)/map/page.tsx`)
  - Add state variables:
    ```typescript
    const [debris, setDebris] = useState<DebrisObject[]>([]);
    const [debrisPositions, setDebrisPositions] = useState<Cartesian3[]>([]);
    const [showDebris, setShowDebris] = useState(true);
    const [selectedDebris, setSelectedDebris] = useState<DebrisObject | null>(null);
    const [speed, setSpeed] = useState(1);
    const speedRef = useRef(1);
    ```
  - Add window global for speed (keanucz style):
    ```typescript
    declare global {
      interface Window {
        __DETOUR_SPEED__?: number;
      }
    }
    ```

- [x] Task 4.2: Implement Debris Data Loading (`frontend/src/app/(main)/map/page.tsx`)
  - Implement keanucz/detour style loading:
    ```typescript
    const DEBRIS_REFRESH_MS = 15_000;
    const DISPLAY_OBJECT_LIMIT = 2500;
    const DEBRIS_ORBIT_CLASSES = "LEO";
    ```
  - Create `loadDebris()` function:
    - Fetch from `/api/debris?limit=${DISPLAY_OBJECT_LIMIT}&orbitClasses=${DEBRIS_ORBIT_CLASSES}`
    - Convert lat/lon/alt to Cartesian3 using Cesium
    - Filter invalid positions
    - Set state
  - Set up interval: `setInterval(loadDebris, DEBRIS_REFRESH_MS)`
  - Abort controller for cleanup
  - Pause updates during simulation mode (keanucz pattern)

- [x] Task 4.3: Add Speed Control UI (`frontend/src/app/(main)/map/page.tsx`)
  - Add speed control overlay (keanucz style):
    ```typescript
    const SPEED_STEPS = [1, 2, 5, 10, 25, 50, 100];
    ```
  - UI component:
    - Position: absolute bottom-4 left-4
    - Label: "SPD"
    - Range slider with steps
    - Display: "{speed}x" with color change when > 1
    - Backdrop: `bg-black/70 backdrop-blur-sm`
    - Border: `border-white/10`
  - Update `window.__DETOUR_SPEED__` on change

- [x] Task 4.4: Add Debris Toggle & Counter (`frontend/src/app/(main)/map/page.tsx`)
  - Add to control bar:
    - Checkbox: "Debris" toggle
    - Tag counter: `<Tag minimal intent="warning">Debris: {debris.length}</Tag>`
    - Orange dot indicator (match debris color #f59e0b)
  - Show/hide DebrisInstancedLayer based on toggle

- [x] Task 4.5: Add Debris to Left Panel (`frontend/src/app/(main)/map/page.tsx`)
  - Add "Space Debris" folder after "Enemy Forces":
    - Icon: `trash` or `scatter-plot` (Blueprint icons)
    - Color: orange/warning intent
    - Count badge
    - Expandable list (top 10 by default)
    - Sort by altitude (lower = higher risk in LEO)
    - Click to fly to debris position

- [x] Task 4.6: Integrate Debris Layers (`frontend/src/app/(main)/map/page.tsx`)
  - Import and integrate:
    ```tsx
    {viewMode === 'earth' && !isSimulationMode && showDebris && (
      <DebrisInstancedLayer
        viewer={viewer}
        debris={debris}
        maxDisplayObjects={2500}
        refreshIntervalMs={15000}
        simTimeRef={simTimeRef}
        showDebris={showDebris}
      />
    )}
    ```
  - Add `<DebrisInfoCard />` when `selectedDebris` is set
  - Clear other selections when debris selected

- [x] Task 4.7: Add Orbital Track for Selected Objects (`frontend/src/app/(main)/map/page.tsx`)
  - When satellite/debris selected:
    - Fetch orbit from `/api/orbit?norad={id}&minutes=180&stepSec=60`
    - Convert to `OrbitTrackState`
    - Render `<OrbitalTrackLayer />`
    - Render `<MovingSatelliteMarker />`
  - Update orbit every 30 seconds (keanucz pattern)
  - Handle maneuver events with visual animation

---

## FASE 5: Testing & Validation

- [x] Task 5.1: Integration Tests (`frontend/src/app/(main)/map/__tests__/page.test.tsx`)
  - Test debris data loads on mount
  - Test 15-second refresh cycle
  - Test toggle hides/shows debris
  - Test speed control updates animation
  - Test debris selection flow

- [x] Task 5.2: Performance Tests
  - Test 2500+ debris objects at 60fps
  - Test memory usage over 5 minutes
  - Test orbit propagation performance (< 100ms)
  - Use React DevTools Profiler

- [x] Task 5.3: E2E Tests
  - Navigate to map → debris visible
  - Toggle debris → hide/show
  - Select debris → info card appears
  - Speed control → animation speeds up
  - Use Playwright

---

## FASE 6: Data Seeding

- [x] Task 6.1: Create Debris Seed Script (`backend/scripts/seed_debris.py`)
  - Fetch real debris from CelesTrack:
    - LEO debris: "COSMOS 2251 Debris", "Fengyun-1C Debris"
    - Rocket bodies: "R/B" suffix
    - Fragments: "DEB" suffix
  - Create entries with `object_type='debris'`
  - Assign categories based on name patterns
  - Import TLE data

- [x] Task 6.2: Seed Database
  - Run script: `python scripts/seed_debris.py`
  - Verify 1000+ debris objects created
  - Verify orbit data populated

---

## FASE 7: Documentation

- [ ] Task 7.1: Update API Documentation
  - Document `/api/debris` endpoint
  - Document `/api/orbit` endpoint
  - Include keanucz/detour style examples

- [ ] Task 7.2: Add Architecture Notes
  - Document keanucz/detour inspiration
  - Explain InstancedMesh pattern in Cesium
  - Document performance optimizations

---

## RIEPILOGO

**Totale task: 26**
- Fase 1: 4 task (Backend API)
- Fase 2: 3 task (Frontend Types & API)
- Fase 3: 5 task (Cesium Components)
- Fase 4: 7 task (Map Integration)
- Fase 5: 3 task (Testing)
- Fase 6: 2 task (Data Seeding)
- Fase 7: 2 task (Documentation)

---

## CHECKLIST FINALE

- [ ] Backend API returns debris in keanucz/detour format
- [ ] Orbit propagation endpoint working
- [ ] Frontend fetches debris every 15 seconds
- [ ] DebrisInstancedLayer renders 2500+ objects at 60fps
- [ ] Orange debris color (#f59e0b) matching keanucz/detour
- [ ] Orbital trails show 20% of orbit arc
- [ ] Speed control (1x-100x) working
- [ ] Maneuver animation (red flash) working
- [ ] All tests pass (> 90% coverage)
- [ ] Performance: 60fps with full debris load
- [ ] No console errors
- [ ] Visual design matches keanucz/detour aesthetic

---

## NOTE IMPORTANTI (Dal keanucz/detour)

- **Performance:** Usare InstancedMesh (Cesium Primitive) per debris
- **Colori:** Debris arancione (#f59e0b), satelliti blu, manovra rosso
- **Aggiornamenti:** 15 secondi per debris, 30 secondi per orbite
- **Trail:** Mostrare solo 20% dell'orbita (frazione visibile)
- **Velocità:** Controllo 1x-100x con damping per animazione smooth
- **Simulazione:** Congelare debris durante simulazione
- **Type hints:** Obbligatori in tutto il codice
- **Error handling:** Graceful degradation, keep previous frame on failure

---

## Riferimenti keanucz/detour

- **Architecture:** 5-agent pipeline (Scout → Analyst → Planner → Safety → Ops)
- **Physics:** RK4 solver, J2 perturbation, CW dynamics, Chan Pc
- **Frontend:** React Three Fiber, @react-three/drei
- **Debris Rendering:** InstancedMesh with drift animation
- **Performance:** 2500 objects, 60fps, 15s refresh
- **Repo:** https://github.com/keanucz/detour
