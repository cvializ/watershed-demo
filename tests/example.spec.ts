import { test, expect } from '@playwright/test';
import { captureConsoleErrors, expectNoConsoleErrors } from './helpers';

test('homepage has a canvas element', async ({ page }) => {
  // Capture console errors during the test
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Assert no console errors occurred
  expectNoConsoleErrors(consoleErrors);
});
