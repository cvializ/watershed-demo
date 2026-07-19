import { test } from "./testUtils";

test("save/load button sequence should work correctly", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click the Save button
  const saveButton = page.getByRole("button", { name: "Save" });
  await saveButton.click();

  // Click the Load button
  const loadButton = page.getByRole("button", { name: "Load" });
  await loadButton.click();

  // Click the Save button again
  await saveButton.click();

  // Click the Load button again
  await loadButton.click();
});