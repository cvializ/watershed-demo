import { Page } from '@playwright/test';

/**
 * Captures all console errors on a page during a test.
 * Returns an array of error messages that you can check at the end.
 */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  return errors;
}

/**
 * Asserts that no console errors were captured.
 * Throws an error with details if there are any.
 */
export function expectNoConsoleErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Console errors detected:\n${errors.join('\n')}`);
  }
}
