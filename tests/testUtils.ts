import { test as baseTest } from '@playwright/test';
import { basename } from 'path';

interface BrowserConsoleOptions {
  failOnPageError: boolean;
}

interface BrowserConsoleFixtures {
  allowPageErrors: () => void;
  _pageErrorState: { allowed: boolean };
}

export const test = baseTest.extend<BrowserConsoleOptions & BrowserConsoleFixtures>({
  failOnPageError: [true, { option: true }],
  _pageErrorState: async ({ failOnPageError }, use) => {
    await use({ allowed: !failOnPageError });
  },
  allowPageErrors: async ({ _pageErrorState }, use) => {
    await use(() => {
      _pageErrorState.allowed = true;
    });
  },
  page: async ({ page, _pageErrorState }, use, testInfo) => {
    const errors: Error[] = [];
    page.on('pageerror', err => {
      const where = `${basename(testInfo.file)}:${testInfo.line}`;
      // eslint-disable-next-line no-console
      console.log(`BROWSER ERROR: ${where} ${err.message}`);
      errors.push(err);
    });
    await use(page);
    if (!_pageErrorState.allowed && errors.length > 0) {
      throw new Error(
        `Browser raised ${errors.length} error(s):\n${errors.map(e => e.stack ?? e.message).join('\n\n')}`
      );
    }
  }
});