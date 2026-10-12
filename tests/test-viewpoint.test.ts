import { test } from "./testUtils";

test("add a first-person viewpoint and view the scene from it", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // The viewpoint panel is present and starts on the default overhead view.
  await page.waitForSelector("#viewpoint-select");
  await page.waitForSelector("#add-viewpoint");
  await page.getByText("Now viewing: Overhead").waitFor();

  // Drop a new viewpoint on the terrain; the view should switch to it.
  await page.click("#add-viewpoint");
  await page.getByText(/Now viewing: Viewpoint/).waitFor();

  // The active view is no longer overhead - it now points at a real viewpoint.
  const activeValue = await page.$eval(
    "#viewpoint-select",
    (select) => (select as HTMLSelectElement).value,
  );
  const activeLabel = await page.$eval("#viewpoint-select", (select) => {
    const element = select as HTMLSelectElement;
    const option = element.options[element.selectedIndex];
    return option ? option.text : "";
  });
  if (activeValue === "-1") {
    throw new Error("expected an active viewpoint, still on overhead");
  }
  if (activeLabel === "Overhead") {
    throw new Error("expected a viewpoint option, still on Overhead");
  }

  // Returning to overhead restores the default camera.
  await page.selectOption("#viewpoint-select", "-1");
  await page.getByText("Now viewing: Overhead").waitFor();
});