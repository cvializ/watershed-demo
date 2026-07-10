import { test, expect } from '@playwright/test';

test('visualizer page should load without errors', async ({ page }) => {
  // Capture console messages
  const consoleMessages: { type: string; text: string }[] = [];
  
  page.on('console', (msg) => {
    const message = {
      type: msg.type(),
      text: msg.text()
    };
    consoleMessages.push(message);
    
    // Log all messages to the test output
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });
  
  // Capture page errors
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
    console.log(`[Page Error] ${error.message}`);
  });
  
  // Navigate to the index page
  await page.goto('/src/shaders/visualizer/');
  
  // Wait for the page to finish loading and executing
  await page.waitForLoadState('networkidle');
  
  // Give some extra time for any async operations
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check for any errors
  const errorMessages = consoleMessages.filter(m => m.type === 'error');
  
  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.forEach((error, i) => {
      console.log(`Error ${i + 1}: ${error.message}`);
    });
  }
  
  if (errorMessages.length > 0) {
    console.log('\n=== Console Errors ===');
    errorMessages.forEach((msg, i) => {
      console.log(`Error ${i + 1}: ${msg.text}`);
    });
  }
  
  // Fail the test if there were errors
  expect(pageErrors, `Page threw ${pageErrors.length} error(s). See console output above.`).toStrictEqual([]);
  expect(errorMessages, `Console logged ${errorMessages.length} error(s). See console output above.`).toStrictEqual([]);
});