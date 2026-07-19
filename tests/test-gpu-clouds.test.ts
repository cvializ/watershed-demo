import { test } from "./testUtils";

test("cloud-system page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-gpu-clouds.html");
  await page.waitForLoadState("networkidle");
});
