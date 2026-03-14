import { test, expect, Page } from '@playwright/test';

/** Mock API response for space weather impact endpoint */
const MOCK_IMPACT = {
  current_conditions: {
    kp_index: 4.0,
    f10_7: 136,
    solar_wind_speed: 520,
    storm_level: 'minor',
    timestamp: '2026-03-14T09:41:00Z',
    xray_class: 'C1.2',
    proton_flux_10mev: 1100,
    dst_index: -28,
  },
  affected_satellites: [
    { norad_id: 50001, name: 'SAT-003', altitude_km: 342, estimated_drag_increase_pct: 9.1 },
    { norad_id: 50002, name: 'SAT-007', altitude_km: 410, estimated_drag_increase_pct: 6.3 },
    { norad_id: 50003, name: 'SAT-012', altitude_km: 520, estimated_drag_increase_pct: 2.8 },
    { norad_id: 50004, name: 'SAT-019', altitude_km: 280, estimated_drag_increase_pct: 12.4 },
  ],
  alert_level: 'yellow',
  active_alerts: [
    { product_id: 'K05A', issue_datetime: '2026-02-15T02:13:00Z', message: 'ALERT: Geomagnetic K-index of 5\nThreshold Reached: 2026 Feb 15 0159 UTC\nSynoptic Period: 0000-0300 UTC\nNOAA Scale: G1 - Minor\nPotential Impacts: Area of impact primarily poleward of 60 degrees Geomagnetic Latitude.' },
    { product_id: 'K05W', issue_datetime: '2026-02-14T21:35:00Z', message: 'WARNING: Geomagnetic K-index of 5 expected\nValid From: 2026 Feb 14 2135 UTC\nValid To: 2026 Feb 15 0600 UTC\nSerial Number: 2190' },
  ],
  total_affected: 4,
  kp_trend_24h: [
    { kp: 3.0, time: '2026-03-13T09:00:00Z' },
    { kp: 3.3, time: '2026-03-13T12:00:00Z' },
    { kp: 2.7, time: '2026-03-13T15:00:00Z' },
    { kp: 3.0, time: '2026-03-13T18:00:00Z' },
    { kp: 3.7, time: '2026-03-13T21:00:00Z' },
    { kp: 4.0, time: '2026-03-14T00:00:00Z' },
    { kp: 4.3, time: '2026-03-14T03:00:00Z' },
    { kp: 4.0, time: '2026-03-14T06:00:00Z' },
  ],
  solar_wind: {
    speed_km_s: 520,
    density_n_cm3: 8.2,
    bz_gsm_nt: -12,
    temperature_k: 120000,
  },
  parsed_alerts: [
    {
      product_id: 'K05A',
      alert_type: 'ALERT',
      title: 'ALERT: Geomagnetic K-index of 5',
      description: 'Area of impact primarily poleward of 60 degrees Geomagnetic Latitude.',
      noaa_scale: 'G1 - Minor',
      issued: '2026 Feb 15 0213 UTC',
      valid_from: '0000-0300 UTC',
      valid_to: null,
      serial: null,
    },
    {
      product_id: 'K05W',
      alert_type: 'WARNING',
      title: 'WARNING: Geomagnetic K-index of 5 expected',
      description: 'Atteso Kp > 5 entro la finestra di validità.',
      noaa_scale: null,
      issued: null,
      valid_from: '2026 Feb 14 2135 UTC',
      valid_to: '2026 Feb 15 0600 UTC',
      serial: '2190',
    },
  ],
};

async function setupMockApi(page: Page) {
  await page.route('**/api/v1/space-weather/impact', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_IMPACT),
    });
  });
}

test.describe('Space Weather Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/space-weather', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  });

  test('renders the page with data-testid', async ({ page }) => {
    await expect(page.locator('[data-testid="space-weather-page"]')).toBeVisible({ timeout: 10_000 });
  });

  test('displays the header with title', async ({ page }) => {
    await expect(page.getByText('Space Weather')).toBeVisible({ timeout: 10_000 });
  });

  test('renders 5 KPI cards', async ({ page }) => {
    await expect(page.getByText('Kp Index', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('F10.7 Solar Flux')).toBeVisible();
    await expect(page.getByText('X-ray Flux')).toBeVisible();
    await expect(page.getByText('Proton Flux >10 MeV')).toBeVisible();
    await expect(page.getByText('DST Index')).toBeVisible();
  });

  test('KPI values match mock data', async ({ page }) => {
    await expect(page.getByText('4.0', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('136', { exact: true })).toBeVisible();
    await expect(page.getByText('C1.2', { exact: true })).toBeVisible();
    await expect(page.getByText('-28', { exact: true })).toBeVisible();
  });

  test('renders the Kp gauge section', async ({ page }) => {
    // The mdash in the component renders as an actual em dash
    await expect(page.getByText(/Kp Index.*gauge e trend 24h/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Quiete (0-3)')).toBeVisible();
    await expect(page.getByText('G1 (3-5)')).toBeVisible();
  });

  test('renders solar wind parameters', async ({ page }) => {
    await expect(page.getByText('Parametri solar wind')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('DSCOVR/ACE')).toBeVisible();
    await expect(page.getByText(/520 km\/s/)).toBeVisible();
    await expect(page.getByText('-12 nT', { exact: true })).toBeVisible();
  });

  test('renders Bz negative warning', async ({ page }) => {
    // Bz = -12 nT is < -5, so warning should show
    await expect(page.getByText(/Bz negativo.*indica accoppiamento/)).toBeVisible({ timeout: 15_000 });
  });

  test('renders operational impact matrix', async ({ page }) => {
    await expect(page.getByText('Impatto operativo per sistema')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Comm HF')).toBeVisible();
    await expect(page.getByText('GPS/GNSS')).toBeVisible();
    await expect(page.getByText('Drag LEO')).toBeVisible();
    await expect(page.getByText('Radar SAR')).toBeVisible();
    await expect(page.getByText('Sensori EO')).toBeVisible();
  });

  test('renders LEO drag risk monitor', async ({ page }) => {
    // Check for the em-dash rendered version
    await expect(page.getByText(/LEO.*drag risk monitor/)).toBeVisible({ timeout: 15_000 });
    // Kp >= 4 so badge should show
    await expect(page.getByText(/Kp.*4 attivo/)).toBeVisible();
    // Satellites from mock data
    await expect(page.getByText('SAT-003')).toBeVisible();
    await expect(page.getByText('SAT-019')).toBeVisible();
  });

  test('renders NOAA parsed alerts', async ({ page }) => {
    await expect(page.getByText('NOAA Alerts parsati')).toBeVisible({ timeout: 15_000 });
    // Check alert types
    await expect(page.getByText('ALERT', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('WARNING', { exact: true }).first()).toBeVisible();
  });

  test('shows storm badge for G1 Minor', async ({ page }) => {
    // storm_level is 'minor' so G1 badge should appear
    await expect(page.getByText('G1 Minor Storm').first()).toBeVisible({ timeout: 15_000 });
  });

  test('auto-refresh countdown is displayed', async ({ page }) => {
    await expect(page.getByText(/refresh \d/)).toBeVisible({ timeout: 15_000 });
  });

  test('renders satellite weather analysis section', async ({ page }) => {
    await expect(page.getByText('Analisi space weather per satellite')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('Cerca satellite...')).toBeVisible();
  });

  test('no JS errors on page load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    await setupMockApi(page);
    await page.goto('/space-weather', { waitUntil: 'networkidle', timeout: 45_000 });
    await expect(page.locator('[data-testid="space-weather-page"]')).toBeVisible({ timeout: 10_000 });

    expect(jsErrors).toHaveLength(0);
  });
});
