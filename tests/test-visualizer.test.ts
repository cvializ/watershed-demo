import { test } from "./testUtils";

test("visualizer page should load without errors", async ({ page }) => {
  await page.goto("/src/shaders/visualizer/");
  await page.waitForLoadState("networkidle");
});
