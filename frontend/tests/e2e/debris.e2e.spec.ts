import { test, expect } from '@playwright/test';

// Mock data for debris and orbit API responses
const mockDebrisResponse = {
  timeUtc: '2026-01-01T00:00:00Z',
  objects: [
    { noradId: 12345, lat: 10, lon: 20, altKm: 400 },
    { noradId: 67890, lat: -5, lon: 30, altKm: 800 },
  ],
};

const mockOrbitResponse = {
  noradId: 12345,
  timeStartUtc: '2026-01-01T00:00:00Z',
  stepSec: 60,
  points: [
    { tUtc: '2026-01-01T00:00:00Z', lat: 10, lon: 20, altKm: 400 },
    { tUtc: '2026-01-01T00:01:00Z', lat: 10.1, lon: 20.1, altKm: 401 },
  ],
};

// Intercept API calls before each test
test.beforeEach(async ({ page }) => {
  await page.route('**/api/debris**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: mockDebrisResponse,
    });
  });

  await page.route('**/api/orbit**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: mockOrbitResponse,
    });
  });
});

test.skip('Debris visualization E2E', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  // Navigate to the map page (baseURL is set in the Playwright config)
  await page.goto('/map', { waitUntil: 'commit', timeout: 60000 });

  // Verify debris items appear in the left panel
  const firstDebrisItem = page.locator('text=NORAD 12345');
  await expect(firstDebrisItem).toBeVisible();

  // Verify the debris counter shows the correct count (2 objects)
  const debrisCounter = page.locator('span:has-text("Debris:")');
  await expect(debrisCounter).toContainText('Debris: 2');

  // Toggle debris visibility using the checkbox
  const debrisCheckbox = page.getByLabel('Debris');
  await expect(debrisCheckbox).toBeChecked();
  await debrisCheckbox.uncheck();
  await expect(debrisCheckbox).not.toBeChecked();
  await debrisCheckbox.check();
  await expect(debrisCheckbox).toBeChecked();

  // Open the DebrisInfoCard by clicking a debris entry
  await firstDebrisItem.click();
  const infoCardHeader = page.getByRole('heading', { name: /Debris 12345/ });
  await expect(infoCardHeader).toBeVisible();

  // Adjust speed control (set to index 2 → 5x speed)
  const speedSlider = page.locator('input[type="range"]');
  await speedSlider.fill('2'); // index 2 corresponds to 5x speed
  const speedVal = await page.evaluate(() => (window as any).__DETOUR_SPEED__);
  expect(speedVal).toBe(5);
});
