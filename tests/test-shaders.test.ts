import { test } from "./testUtils";

test("test-shaders page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-shaders");
  await page.waitForLoadState("networkidle");
});
