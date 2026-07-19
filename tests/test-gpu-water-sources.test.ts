import { test } from "./testUtils";

test("gpu-water-sources page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-gpu-water-sources.html");
  await page.waitForLoadState("networkidle");
});
