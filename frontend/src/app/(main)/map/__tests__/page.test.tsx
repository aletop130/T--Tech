// @vitest-environment jsdom

/**
 * Integration tests for the Map page focusing on debris visualization features.
 * Covers:
 *  - Debris data loading on mount
 *  - 15‑second refresh cycle
 *  - Debris toggle visibility
 *  - Speed control UI updates window.__DETOUR_SPEED__
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDebris } from '@/lib/api/debris';

const pushMock = vi.fn();

// --- Mock external modules -------------------------------------------------
const mockComponent = (testId: string) => (props: any) => <div data-testid={testId} {...props} />;

// Mock the API client for debris fetching and other backend calls.
vi.mock('@/lib/api/debris', () => {
  return {
    getDebris: vi.fn(),
    getOrbit: vi.fn(),
  };
});

// Mock the generic Detour API used for ground stations, satellites, etc.
vi.mock('@/lib/api', () => {
  return {
    api: {
      getGroundStations: vi.fn(() => Promise.resolve({ items: [] })),
      getSatellitesWithOrbits: vi.fn(() => Promise.resolve([])),
      getConjunctions: vi.fn(() => Promise.resolve({ items: [] })),
      getGroundVehicles: vi.fn(() => Promise.resolve({ items: [] })),
      fetchFamousSatellites: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
    },
  };
});

// Mock Cesium loader – provides minimal API needed by the page.
vi.mock('@/lib/cesium/loader', () => {
  const mockCesium = {
    Cartesian3: {
      fromDegrees: vi.fn(() => ({})),
    },
    Math: {
      toRadians: vi.fn(() => 0),
    },
  };
  return {
    getCesium: vi.fn(() => Promise.resolve(mockCesium)),
    isCesiumLoaded: vi.fn(),
    getCesiumSync: vi.fn(),
  };
});

// Mock all Cesium‑related UI components – they are not needed for the logic we test.
// (Component factories are inlined in each vi.mock call.)

vi.mock('@/components/CesiumMap/CesiumViewer', () => {
  const React = require('react');
  return {
    CesiumViewer: (props: any) => {
      const { onViewerReady } = props;
      React.useEffect(() => {
        // Provide a minimal mock viewer that satisfies the code path.
        const mockViewer = {
          scene: { primitives: { add: vi.fn(), remove: vi.fn() } },
          camera: { flyTo: vi.fn() },
          isDestroyed: vi.fn(() => false),
        } as any;
        if (onViewerReady) {
          onViewerReady(mockViewer);
        }
      }, [onViewerReady]);
      return <div data-testid="cesium-viewer" />;
    },
  };
});

vi.mock('@/components/CesiumMap/DebrisInstancedLayer', () => ({
  DebrisInstancedLayer: (props: any) => <div data-testid="debris-layer" {...props} />,
}));
vi.mock('@/components/CesiumMap/SatelliteLayer', () => ({ SatelliteLayer: (props: any) => <div data-testid="satellite-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/GroundStationLayer', () => ({ GroundStationLayer: (props: any) => <div data-testid="ground-station-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/GroundVehicleLayer', () => ({ GroundVehicleLayer: (props: any) => <div data-testid="ground-vehicle-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/MilitaryVehicleLayer', () => ({ MilitaryVehicleLayer: (props: any) => <div data-testid="military-vehicle-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/ConjunctionLayer', () => ({ ConjunctionLayer: (props: any) => <div data-testid="conjunction-layer" {...props} /> }));
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
}));
vi.mock('@/components/CesiumMap/SatelliteInfoCard', () => ({ SatelliteInfoCard: (props: any) => <div data-testid="satellite-info-card" {...props} /> }));
vi.mock('@/components/CesiumMap/GroundStationInfoCard', () => ({ GroundStationInfoCard: (props: any) => <div data-testid="ground-station-info-card" {...props} /> }));
vi.mock('@/components/CesiumMap/GroundVehicleInfoCard', () => ({ GroundVehicleInfoCard: (props: any) => <div data-testid="ground-vehicle-info-card" {...props} /> }));
vi.mock('@/components/CesiumMap/ConjunctionInfoCard', () => ({ ConjunctionInfoCard: (props: any) => <div data-testid="conjunction-info-card" {...props} /> }));
vi.mock('@/components/CesiumMap/DebrisInfoCard', () => ({ DebrisInfoCard: (props: any) => <div data-testid="debris-info-card" {...props} /> }));
vi.mock('@/components/CesiumMap/OrbitalTrackLayer', () => ({ OrbitalTrackLayer: (props: any) => <div data-testid="orbital-track-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/MovingSatelliteMarker', () => ({ MovingSatelliteMarker: (props: any) => <div data-testid="moving-satellite-marker" {...props} /> }));
vi.mock('@/components/CesiumMap/SolarSystemLayer', () => ({ SolarSystemLayer: (props: any) => <div data-testid="solar-system-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/PlanetInfoBox', () => ({ PlanetInfoBox: (props: any) => <div data-testid="planet-info-box" {...props} /> }));
vi.mock('@/components/Chat/AgentChat', () => ({
  AgentChat: (props: any) => (
    <div data-testid="agent-chat">
      <div data-testid="agent-chat-prompts">{JSON.stringify(props.quickPrompts ?? [])}</div>
      <button
        data-testid="agent-chat-sim-start"
        onClick={() =>
          props.onSimulationControl?.({
            action: 'start_sar_simulation',
            mode: 'enter_simulation_mode',
            source: 'test',
          })
        }
      >
        Trigger simulation
      </button>
      <button
        data-testid="agent-chat-sandbox-open"
        onClick={() =>
          props.onSimulationControl?.({
            action: 'open_sandbox',
            prompt: 'Open sandbox for a custom simulation',
            mode: 'navigate',
            source: 'test',
          })
        }
      >
        Open sandbox
      </button>
    </div>
  ),
}));
vi.mock('@/components/ProximityAlertPanel/UnifiedAlertsPanel', () => ({ UnifiedAlertsPanel: (props: any) => <div data-testid="unified-alerts-panel" {...props} /> }));
vi.mock('@/components/CesiumMap/SimulatedSatelliteLayer', () => ({ SimulatedSatelliteLayer: (props: any) => <div data-testid="simulated-satellite-layer" {...props} /> }));
vi.mock('@/components/CesiumMap/MilitarySymbolLayer', () => ({ MilitarySymbolLayer: (props: any) => <div data-testid="military-symbol-layer" {...props} /> }));
vi.mock('@/components/Simulation/MissionNarrative', () => ({ MissionNarrative: (props: any) => <div data-testid="mission-narrative" {...props} /> }));
vi.mock('@/components/Simulation/MissionHUD', () => ({ MissionHUD: (props: any) => <div data-testid="mission-hud" {...props} /> }));

// --------------------------------------------------------------------------

import MapPage from '../page'; // The default export renders the page inside Suspense.



/** Small utility to render the page and wait for the initial debris load. */
async function renderPageAndWait() {
  const result = render(<MapPage />);
  // Wait for the debris layer to appear (initial load).
  await waitFor(() => expect(screen.getByTestId('debris-layer')).toBeInTheDocument());
  return result;
}

describe('Map page integration – debris features', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset mock implementations before each test.
    vi.resetAllMocks();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads debris on mount and renders layer', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [{ noradId: 1, lat: 10, lon: 20, altKm: 400 }],
    };
    getDebris.mockResolvedValueOnce(mockData);

    await renderPageAndWait();

    // Debris layer should be rendered because showDebris defaults to true.
    expect(screen.getByTestId('debris-layer')).toBeInTheDocument();
  });

  it('refreshes debris every 15 seconds', async () => {
    const first = { timeUtc: '2026-01-01T00:00:00Z', objects: [{ noradId: 1, lat: 0, lon: 0, altKm: 400 }] };
    const second = { timeUtc: '2026-01-01T00:00:15Z', objects: [
      { noradId: 1, lat: 0, lon: 0, altKm: 400 },
      { noradId: 2, lat: 1, lon: 1, altKm: 410 },
    ] };
    const mock = getDebris;
    mock.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await renderPageAndWait();

    // Advance the 15-second interval.
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    // Debris layer should still be rendered after refresh.
    expect(screen.getByTestId('debris-layer')).toBeInTheDocument();
  });

  it('toggles debris visibility using the checkbox', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [{ noradId: 1, lat: 10, lon: 20, altKm: 400 }],
    };
    getDebris.mockResolvedValueOnce(mockData);

    await renderPageAndWait();
    const checkbox = screen.getByRole('checkbox', { name: /Debris/i });
    // Initially checked and layer is present.
    expect(checkbox).toBeChecked();
    expect(screen.getByTestId('debris-layer')).toBeInTheDocument();

    // Uncheck to hide debris.
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByTestId('debris-layer')).not.toBeInTheDocument();

    // Re‑check to show again.
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByTestId('debris-layer')).toBeInTheDocument();
  });

  it('updates speed control and global window variable', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [],
    };
    getDebris.mockResolvedValueOnce(mockData);

    await renderPageAndWait();
    const slider = screen.getByRole('slider');
    // Default speed is 1x (index 0).
    expect(slider).toHaveValue('0');
    expect(window.__DETOUR_SPEED__).toBeUndefined();

    // Move slider to index 2 => SPEED_STEPS[2] === 5
    fireEvent.change(slider, { target: { value: '2' } });
    expect(slider).toHaveValue('2');
    expect(window.__DETOUR_SPEED__).toBe(5);
    expect(screen.getByText('5x')).toBeInTheDocument();
  });

  it('removes the Fly to ISS quick prompt from the map chat', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [],
    };
    getDebris.mockResolvedValueOnce(mockData);

    render(<MapPage />);

    const promptText = screen.getByTestId('agent-chat-prompts').textContent ?? '';

    expect(promptText).toContain('Mostrami la minaccia più critica');
    expect(promptText).toContain('Tour della costellazione');
    expect(promptText).toContain('Briefing situazione');
    expect(promptText).toContain('Analizza le congiunzioni attive');
    expect(promptText).not.toContain('Fly to ISS');
  });

  it('starts SAR simulation when chat emits simulation control command', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [],
    };
    getDebris.mockResolvedValueOnce(mockData);

    await renderPageAndWait();
    expect(screen.getByText('Start SAR Simulation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agent-chat-sim-start'));

    await waitFor(() => expect(screen.getByText('Exit Simulation')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('START MISSION')).toBeInTheDocument());
  });

  it('navigates to sandbox when chat emits open_sandbox control', async () => {
    const mockData = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [],
    };
    getDebris.mockResolvedValueOnce(mockData);

    await renderPageAndWait();

    fireEvent.click(screen.getByTestId('agent-chat-sandbox-open'));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/sandbox?prompt=Open+sandbox+for+a+custom+simulation');
    });
  });
});
