import { test } from "./testUtils";

test("gpu-substance-save-load page should load without errors", async ({
  page,
}) => {
  await page.goto("/tests/test-gpu-substance-save-load.html");

  // The client module throws on any broken invariant, so reaching its completion marker means both substance
  // compartments really made it through save/load. A thrown error fails this test via the console/page error fixture
  // in testUtils, exactly as it does for the other GPU suites.
  //
  // The marker carries the number of scenarios that actually finished (the page asserts that count itself), and this
  // suite waits for all six rather than "more than zero": a persistence bug can leave one scenario green - the
  // non-vacuity preconditions need no restoration to be correct - so partial completion must not read as green.
  await page.waitForFunction(
    () =>
      Number(document.body.dataset.substanceSaveLoadTestsComplete ?? "0") >= 6,
    null,
    { timeout: 180_000 },
  );
});
