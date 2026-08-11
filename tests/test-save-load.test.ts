import { test } from "./testUtils";

test("save/load button sequence should work correctly", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click the Save button (GameUI storage buttons, not TerrainPaintingControls)
  const saveButton = page.getByTitle("Save current state");
  await saveButton.click();

  // Click the Load button
  const loadButton = page.getByTitle("Load saved state");
  await loadButton.click();

  // Click the Save button again
  await saveButton.click();

  // Click the Load button again
  await loadButton.click();
});
