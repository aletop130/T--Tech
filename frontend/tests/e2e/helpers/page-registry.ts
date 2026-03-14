export interface PageInfo {
  route: string;
  label: string;
  type: 'standalone' | 'consolidated';
  expectedSelector: string;
  criticalApis: string[];
  domain: 'core' | 'operations' | 'intelligence' | 'data';
}

export const PAGE_REGISTRY: PageInfo[] = [
  {
    route: '/dashboard',
    label: 'Dashboard',
    type: 'standalone',
    domain: 'core',
    expectedSelector: 'h1:has-text("Dashboard")',
    criticalApis: ['/api/incidents/stats', '/api/conjunctions', '/api/space-weather', '/api/satellites'],
  },
  {
    route: '/map',
    label: 'Map',
    type: 'standalone',
    domain: 'core',
    expectedSelector: '.cesium-viewer, [class*="sidebar"]',
    criticalApis: ['/api/satellites', '/api/debris', '/api/ground-stations'],
  },
  {
    route: '/explorer',
    label: 'Explorer',
    type: 'standalone',
    domain: 'core',
    expectedSelector: 'h1:has-text("Explorer")',
    criticalApis: ['/api/satellites'],
  },
  {
    route: '/graph',
    label: 'Graph',
    type: 'standalone',
    domain: 'core',
    expectedSelector: 'h1:has-text("Graph")',
    criticalApis: ['/api/graph'],
  },
  {
    route: '/incidents',
    label: 'Incidents',
    type: 'standalone',
    domain: 'operations',
    expectedSelector: 'h1:has-text("Incident")',
    criticalApis: ['/api/incidents'],
  },
  {
    route: '/detour',
    label: 'Detour',
    type: 'standalone',
    domain: 'operations',
    expectedSelector: 'h1:has-text("Detour"), h1:has-text("DETOUR")',
    criticalApis: ['/api/detour'],
  },
  {
    route: '/operations',
    label: 'Operations',
    type: 'consolidated',
    domain: 'operations',
    expectedSelector: 'h1:has-text("Operations")',
    criticalApis: ['/api/operations', '/api/routes', '/api/formations'],
  },
  {
    route: '/threats',
    label: 'Threats',
    type: 'consolidated',
    domain: 'intelligence',
    expectedSelector: '[data-testid="threats-page"]',
    criticalApis: ['/api/threats', '/api/fleet-risk'],
  },
  {
    route: '/events',
    label: 'Events',
    type: 'consolidated',
    domain: 'intelligence',
    expectedSelector: '[data-testid="events-page"]',
    criticalApis: ['/api/launches', '/api/reentry', '/api/maneuvers'],
  },
  {
    route: '/space-weather',
    label: 'Space Weather',
    type: 'standalone',
    domain: 'intelligence',
    expectedSelector: '[data-testid="space-weather-page"]',
    criticalApis: ['/api/space-weather'],
  },
  {
    route: '/environment',
    label: 'Environment',
    type: 'consolidated',
    domain: 'intelligence',
    expectedSelector: '[data-testid="environment-page"]',
    criticalApis: ['/api/space-weather', '/api/rf-spectrum'],
  },
  {
    route: '/country-dashboard',
    label: 'Country Dashboard',
    type: 'standalone',
    domain: 'data',
    expectedSelector: 'h1:has-text("Countr")',
    criticalApis: ['/api/country'],
  },
  {
    route: '/ingestion',
    label: 'Ingestion',
    type: 'standalone',
    domain: 'data',
    expectedSelector: 'h1:has-text("Ingestion")',
    criticalApis: ['/api/ingestion'],
  },
  {
    route: '/admin',
    label: 'Admin',
    type: 'standalone',
    domain: 'data',
    expectedSelector: 'h1:has-text("Admin")',
    criticalApis: ['/api/admin'],
  },
];
