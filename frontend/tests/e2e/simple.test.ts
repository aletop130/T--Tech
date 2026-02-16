import { test, expect } from '@playwright/test';

test('simple page loads', async ({ page }) => {
  await page.goto('about:blank');
  await expect(page).toHaveURL('about:blank');
});
