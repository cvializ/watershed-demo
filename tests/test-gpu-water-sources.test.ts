import { test } from './testUtils';

test('test-shaders page should load without errors', async ({ page }) => {
  
  // Navigate to the test page
  await page.goto('/tests/test-gpu-water-sources.html');
  
  // Wait for the page to finish loading and executing
  await page.waitForLoadState('networkidle');
  
  // Give some extra time for any async operations
  await new Promise(resolve => setTimeout(resolve, 1000));
});
