import { test as baseTest } from "@playwright/test";
import { basename } from "path";

interface BrowserConsoleOptions {
  failOnPageError: boolean;
  failOnConsoleError: boolean;
}

interface BrowserConsoleFixtures {
  allowPageErrors: () => void;
  allowConsoleErrors: () => void;
  _pageErrorState: { allowed: boolean };
  _consoleErrorState: { allowed: boolean };
}

export const test = baseTest.extend<BrowserConsoleOptions & BrowserConsoleFixtures>({
  failOnPageError: [true, { option: true }],
  failOnConsoleError: [true, { option: true }],
  _pageErrorState: async ({ failOnPageError }, use) => {
    await use({ allowed: !failOnPageError });
  },
  _consoleErrorState: async ({ failOnConsoleError }, use) => {
    await use({ allowed: !failOnConsoleError });
  },
  allowPageErrors: async ({ _pageErrorState }, use) => {
    await use(() => {
      _pageErrorState.allowed = true;
    });
  },
  allowConsoleErrors: async ({ _consoleErrorState }, use) => {
    await use(() => {
      _consoleErrorState.allowed = true;
    });
  },
  page: async ({ page, _pageErrorState, _consoleErrorState }, use, testInfo) => {
    const errors: { type: string; message: string }[] = [];
    
    page.on("pageerror", (err) => {
      const where = `${basename(testInfo.file)}:${testInfo.line}`;
      // eslint-disable-next-line no-console
      console.log(`BROWSER ERROR: ${where} ${err.message}`);
      errors.push({ type: 'pageerror', message: err.message });
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const where = `${basename(testInfo.file)}:${testInfo.line}`;
        // eslint-disable-next-line no-console
        console.log(`BROWSER CONSOLE ERROR: ${where} ${msg.text()}`);
        errors.push({ type: 'console', message: msg.text() });
      }
    });

    await use(page);

    const allErrorsAllowed = _pageErrorState.allowed && _consoleErrorState.allowed;
    const pageErrorsAllowed = _pageErrorState.allowed;
    const consoleErrorsAllowed = _consoleErrorState.allowed;

    if (!allErrorsAllowed && errors.length > 0) {
      const pageErrorCount = errors.filter(e => e.type === 'pageerror').length;
      const consoleErrorCount = errors.filter(e => e.type === 'console').length;
      
      let message = `Browser raised ${errors.length} error(s):`;
      if (pageErrorCount > 0 && !pageErrorsAllowed) {
        message += `\n  - ${pageErrorCount} page error(s)`;
      }
      if (consoleErrorCount > 0 && !consoleErrorsAllowed) {
        message += `\n  - ${consoleErrorCount} console error(s)`;
      }
      message += `\n${errors.map((e) => e.message).join("\n")}`;
      
      throw new Error(message);
    }
  },
});
