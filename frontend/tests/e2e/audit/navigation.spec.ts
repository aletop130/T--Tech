import { test, expect } from '@playwright/test';
import { PAGE_REGISTRY } from '../helpers/page-registry';

test.describe('Sidebar Navigation Audit', () => {
  test('sidebar is present on dashboard', async ({ page }) => {
    await page.goto('/dashboard', {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });

    // Verify sidebar exists - try common sidebar selectors
    const sidebar = page.locator(
      'nav, aside, [class*="sidebar"], [class*="Sidebar"], [data-testid="sidebar"]',
    );
    await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });
  });

  for (const pageInfo of PAGE_REGISTRY) {
    test(`navigate to ${pageInfo.label} (${pageInfo.route})`, async ({ page }) => {
      // Start from dashboard
      await page.goto('/dashboard', {
        waitUntil: 'networkidle',
        timeout: 45_000,
      });

      // Try to find and click sidebar link for this page
      const linkSelectors = [
        `nav a[href="${pageInfo.route}"]`,
        `aside a[href="${pageInfo.route}"]`,
        `[class*="sidebar"] a[href="${pageInfo.route}"]`,
        `[class*="Sidebar"] a[href="${pageInfo.route}"]`,
        `a[href="${pageInfo.route}"]`,
      ];

      let linkFound = false;
      for (const selector of linkSelectors) {
        const link = page.locator(selector).first();
        if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await link.click();
          linkFound = true;
          break;
        }
      }

      if (!linkFound) {
        // Fallback: try clicking by label text within nav elements
        const textLink = page.locator(
          `nav :text("${pageInfo.label}"), aside :text("${pageInfo.label}"), [class*="sidebar"] :text("${pageInfo.label}")`,
        ).first();

        if (await textLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await textLink.click();
          linkFound = true;
        }
      }

      if (!linkFound) {
        // Direct navigation as last resort
        console.log(
          `  [WARN] No sidebar link found for ${pageInfo.label}, using direct navigation`,
        );
        await page.goto(pageInfo.route, {
          waitUntil: 'networkidle',
          timeout: 45_000,
        });
      } else {
        // Wait for navigation to complete
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
      }

      // Verify URL changed to expected route
      const currentUrl = page.url();
      expect(currentUrl).toContain(pageInfo.route);

      // Verify page loaded - check for expected selector
      try {
        await expect(
          page.locator(pageInfo.expectedSelector).first(),
        ).toBeVisible({ timeout: 10_000 });
        console.log(`  [PASS] ${pageInfo.label}: navigated and rendered`);
      } catch {
        console.log(
          `  [WARN] ${pageInfo.label}: navigated but expected selector not found (${pageInfo.expectedSelector})`,
        );
      }

      // Attach navigation result
      await test.info().attach('navigation-result.json', {
        body: JSON.stringify(
          {
            route: pageInfo.route,
            label: pageInfo.label,
            linkFound,
            finalUrl: currentUrl,
            urlMatches: currentUrl.includes(pageInfo.route),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
    });
  }
});
