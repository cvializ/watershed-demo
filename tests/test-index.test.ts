import { test } from "./testUtils";

test("index page should load without errors", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});
