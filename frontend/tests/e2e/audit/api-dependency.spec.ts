import { test } from '@playwright/test';
import { PAGE_REGISTRY } from '../helpers/page-registry';

interface ApiCallRecord {
  url: string;
  method: string;
  status: number | null;
  timestamp: number;
}

test.describe('API Dependency Audit', () => {
  for (const pageInfo of PAGE_REGISTRY) {
    test(`API deps: ${pageInfo.label} (${pageInfo.route})`, async ({ page }) => {
      const apiCalls: ApiCallRecord[] = [];

      // Intercept all API requests
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiCalls.push({
            url: request.url(),
            method: request.method(),
            status: null,
            timestamp: Date.now(),
          });
        }
      });

      page.on('response', (response) => {
        if (response.url().includes('/api/')) {
          const existing = apiCalls.find(
            (c) => c.url === response.url() && c.status === null,
          );
          if (existing) {
            existing.status = response.status();
          } else {
            apiCalls.push({
              url: response.url(),
              method: response.request().method(),
              status: response.status(),
              timestamp: Date.now(),
            });
          }
        }
      });

      // Navigate to page
      try {
        await page.goto(pageInfo.route, {
          waitUntil: 'networkidle',
          timeout: 45_000,
        });
      } catch {
        // Navigation may fail but we still want to capture whatever API calls happened
      }

      // Wait a bit for any late API calls
      await page.waitForTimeout(2_000);

      // Build dependency matrix entry
      const dependencyEntry = {
        route: pageInfo.route,
        label: pageInfo.label,
        domain: pageInfo.domain,
        type: pageInfo.type,
        expectedApis: pageInfo.criticalApis,
        actualApiCalls: apiCalls.map((c) => ({
          url: c.url,
          method: c.method,
          status: c.status,
        })),
        missingApis: pageInfo.criticalApis.filter(
          (expected) => !apiCalls.some((c) => c.url.includes(expected)),
        ),
        unexpectedApis: apiCalls
          .filter(
            (c) =>
              !pageInfo.criticalApis.some((expected) =>
                c.url.includes(expected),
              ),
          )
          .map((c) => c.url),
        summary: {
          totalCalls: apiCalls.length,
          successful: apiCalls.filter(
            (c) => c.status !== null && c.status >= 200 && c.status < 300,
          ).length,
          clientErrors: apiCalls.filter(
            (c) => c.status !== null && c.status >= 400 && c.status < 500,
          ).length,
          serverErrors: apiCalls.filter(
            (c) => c.status !== null && c.status >= 500,
          ).length,
          noResponse: apiCalls.filter((c) => c.status === null).length,
        },
      };

      // Log summary
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  API DEPENDENCY: ${pageInfo.label} (${pageInfo.route})`);
      console.log(`${'='.repeat(60)}`);
      console.log(`  Total API calls:  ${dependencyEntry.summary.totalCalls}`);
      console.log(`  Successful:       ${dependencyEntry.summary.successful}`);
      console.log(`  Client errors:    ${dependencyEntry.summary.clientErrors}`);
      console.log(`  Server errors:    ${dependencyEntry.summary.serverErrors}`);
      console.log(`  No response:      ${dependencyEntry.summary.noResponse}`);
      console.log(`  Missing APIs:     ${dependencyEntry.missingApis.join(', ') || 'none'}`);
      console.log(`${'='.repeat(60)}\n`);

      // Attach dependency data as JSON artifact
      await test.info().attach('api-dependency.json', {
        body: JSON.stringify(dependencyEntry, null, 2),
        contentType: 'application/json',
      });
    });
  }
});
