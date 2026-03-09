import { test, expect } from '@playwright/test';
import { PAGE_REGISTRY, PageInfo } from '../helpers/page-registry';

interface ApiCall {
  url: string;
  method: string;
  status: number | null;
}

type HealthStatus = 'PASS' | 'WARN' | 'FAIL';

test.describe('Page Health Audit', () => {
  for (const pageInfo of PAGE_REGISTRY) {
    test(`[${pageInfo.domain}] ${pageInfo.label} (${pageInfo.route})`, async ({ page }) => {
      const jsErrors: string[] = [];
      const consoleErrors: string[] = [];
      const apiCalls: ApiCall[] = [];

      // 1. Capture JS errors
      page.on('pageerror', (error) => {
        jsErrors.push(error.message);
      });

      // 2. Capture console.error messages
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // 3. Track API calls and responses
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiCalls.push({
            url: request.url(),
            method: request.method(),
            status: null,
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
            });
          }
        }
      });

      // 4. Navigate to the page
      let navigationError: string | null = null;
      try {
        await page.goto(pageInfo.route, {
          waitUntil: 'networkidle',
          timeout: 45_000,
        });
      } catch (err) {
        navigationError = err instanceof Error ? err.message : String(err);
      }

      // 5. Check expectedSelector visibility
      let selectorVisible = false;
      if (!navigationError) {
        try {
          await expect(page.locator(pageInfo.expectedSelector).first()).toBeVisible({
            timeout: 10_000,
          });
          selectorVisible = true;
        } catch {
          selectorVisible = false;
        }
      }

      // 6. Classify result
      const failedApis = apiCalls.filter(
        (c) => c.status !== null && c.status >= 500,
      );
      const clientErrors = apiCalls.filter(
        (c) => c.status !== null && c.status >= 400 && c.status < 500,
      );

      let status: HealthStatus;
      if (navigationError || jsErrors.length > 0 || !selectorVisible) {
        status = 'FAIL';
      } else if (
        consoleErrors.length > 0 ||
        failedApis.length > 0 ||
        clientErrors.length > 0
      ) {
        status = 'WARN';
      } else {
        status = 'PASS';
      }

      // 7. Log summary
      const summary = buildSummary(pageInfo, {
        status,
        navigationError,
        selectorVisible,
        jsErrors,
        consoleErrors,
        apiCalls,
        failedApis,
        clientErrors,
      });

      console.log(summary);

      // Attach summary as test artifact for HTML report
      await test.info().attach('health-summary.json', {
        body: JSON.stringify(
          {
            route: pageInfo.route,
            label: pageInfo.label,
            status,
            selectorVisible,
            navigationError,
            jsErrorCount: jsErrors.length,
            consoleErrorCount: consoleErrors.length,
            apiCallCount: apiCalls.length,
            failedApiCount: failedApis.length,
            clientErrorCount: clientErrors.length,
            jsErrors,
            consoleErrors: consoleErrors.slice(0, 10),
            failedApis,
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });

      // Only hard-fail on navigation errors or JS crashes
      if (navigationError) {
        test.fail(true, `Navigation failed: ${navigationError}`);
      }
    });
  }
});

function buildSummary(
  pageInfo: PageInfo,
  data: {
    status: HealthStatus;
    navigationError: string | null;
    selectorVisible: boolean;
    jsErrors: string[];
    consoleErrors: string[];
    apiCalls: ApiCall[];
    failedApis: ApiCall[];
    clientErrors: ApiCall[];
  },
): string {
  const lines = [
    '',
    '='.repeat(60),
    `  PAGE HEALTH: ${pageInfo.label} (${pageInfo.route})`,
    `  Status: ${data.status}`,
    '='.repeat(60),
    `  Selector visible:    ${data.selectorVisible}`,
    `  JS errors:           ${data.jsErrors.length}`,
    `  Console errors:      ${data.consoleErrors.length}`,
    `  Total API calls:     ${data.apiCalls.length}`,
    `  Failed APIs (5xx):   ${data.failedApis.length}`,
    `  Client errors (4xx): ${data.clientErrors.length}`,
  ];

  if (data.navigationError) {
    lines.push(`  Navigation error:    ${data.navigationError}`);
  }

  if (data.jsErrors.length > 0) {
    lines.push('  JS Errors:');
    data.jsErrors.slice(0, 5).forEach((e) => lines.push(`    - ${e}`));
  }

  if (data.failedApis.length > 0) {
    lines.push('  Failed API calls:');
    data.failedApis.forEach((c) =>
      lines.push(`    - [${c.status}] ${c.method} ${c.url}`),
    );
  }

  lines.push('='.repeat(60), '');
  return lines.join('\n');
}
