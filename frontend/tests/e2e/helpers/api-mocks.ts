import { Page } from '@playwright/test';

/**
 * Mock an API response for a given URL pattern.
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  responseBody: unknown,
  status = 200,
) {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    });
  });
}

// ---------------------------------------------------------------------------
// Pre-built mock responses for common API endpoints
// ---------------------------------------------------------------------------

export const MOCK_SATELLITES = [
  {
    id: 1,
    name: 'ISS (ZARYA)',
    norad_id: 25544,
    country: 'US',
    orbit_type: 'LEO',
    status: 'active',
  },
  {
    id: 2,
    name: 'STARLINK-1234',
    norad_id: 44000,
    country: 'US',
    orbit_type: 'LEO',
    status: 'active',
  },
];

export const MOCK_INCIDENTS = [
  {
    id: 'INC-001',
    title: 'Conjunction Alert',
    severity: 'high',
    status: 'open',
    created_at: '2026-03-01T12:00:00Z',
  },
];

export const MOCK_INCIDENT_STATS = {
  total: 42,
  open: 5,
  closed: 37,
  critical: 2,
};

export const MOCK_CONJUNCTIONS = [
  {
    id: 'CNJ-001',
    primary: 'ISS',
    secondary: 'DEBRIS-9999',
    tca: '2026-03-10T08:30:00Z',
    probability: 0.00012,
    miss_distance_km: 0.5,
  },
];

export const MOCK_SPACE_WEATHER = {
  kp_index: 3,
  solar_flux: 120,
  storm_level: 'none',
  updated_at: '2026-03-09T00:00:00Z',
};

export const MOCK_DEBRIS = [
  {
    id: 1,
    norad_id: 99001,
    name: 'DEBRIS-A',
    origin: 'COSMOS 2251',
    size_class: 'medium',
  },
];

export const MOCK_GROUND_STATIONS = [
  {
    id: 1,
    name: 'Goldstone',
    lat: 35.4267,
    lon: -116.89,
    country: 'US',
  },
];

export const MOCK_GRAPH = {
  nodes: [
    { id: '1', label: 'ISS' },
    { id: '2', label: 'DEBRIS-A' },
  ],
  edges: [{ source: '1', target: '2', type: 'conjunction' }],
};

export const MOCK_LAUNCHES = [
  {
    id: 'L-001',
    mission: 'Starlink Group 12-5',
    provider: 'SpaceX',
    date: '2026-03-15T14:00:00Z',
    status: 'upcoming',
  },
];

export const MOCK_REENTRY = [
  {
    id: 'R-001',
    object: 'CZ-5B R/B',
    predicted_date: '2026-03-12T00:00:00Z',
    uncertainty_hours: 12,
  },
];

export const MOCK_MANEUVERS = [
  {
    id: 'M-001',
    satellite: 'ISS',
    type: 'debris_avoidance',
    date: '2026-03-08T06:00:00Z',
  },
];

export const MOCK_THREATS = [
  {
    id: 'T-001',
    type: 'ASAT',
    source: 'Unknown',
    threat_level: 'medium',
  },
];

export const MOCK_FLEET_RISK = {
  overall_risk: 'low',
  satellites_at_risk: 3,
  total_monitored: 150,
};

export const MOCK_COUNTRY = [
  { country: 'US', satellite_count: 4500, debris_count: 3200 },
  { country: 'CN', satellite_count: 800, debris_count: 4100 },
  { country: 'RU', satellite_count: 1600, debris_count: 5000 },
];

/**
 * Apply a standard set of mocks to cover the most common API calls.
 * Useful for tests that just need pages to render without real backend.
 */
export async function applyStandardMocks(page: Page) {
  await Promise.all([
    mockApiResponse(page, '**/api/satellites**', MOCK_SATELLITES),
    mockApiResponse(page, '**/api/incidents/stats**', MOCK_INCIDENT_STATS),
    mockApiResponse(page, '**/api/incidents**', MOCK_INCIDENTS),
    mockApiResponse(page, '**/api/conjunctions**', MOCK_CONJUNCTIONS),
    mockApiResponse(page, '**/api/space-weather**', MOCK_SPACE_WEATHER),
    mockApiResponse(page, '**/api/debris**', MOCK_DEBRIS),
    mockApiResponse(page, '**/api/ground-stations**', MOCK_GROUND_STATIONS),
    mockApiResponse(page, '**/api/graph**', MOCK_GRAPH),
    mockApiResponse(page, '**/api/launches**', MOCK_LAUNCHES),
    mockApiResponse(page, '**/api/reentry**', MOCK_REENTRY),
    mockApiResponse(page, '**/api/maneuvers**', MOCK_MANEUVERS),
    mockApiResponse(page, '**/api/threats**', MOCK_THREATS),
    mockApiResponse(page, '**/api/fleet-risk**', MOCK_FLEET_RISK),
    mockApiResponse(page, '**/api/country**', MOCK_COUNTRY),
    mockApiResponse(page, '**/api/detour**', []),
    mockApiResponse(page, '**/api/operations**', []),
    mockApiResponse(page, '**/api/routes**', []),
    mockApiResponse(page, '**/api/formations**', []),
    mockApiResponse(page, '**/api/rf-spectrum**', {}),
    mockApiResponse(page, '**/api/ingestion**', {}),
    mockApiResponse(page, '**/api/admin**', {}),
  ]);
}
