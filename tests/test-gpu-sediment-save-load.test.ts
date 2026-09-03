import { test } from "./testUtils";

test("gpu-sediment-save-load page should load without errors", async ({
  page,
}) => {
  await page.goto("/tests/test-gpu-sediment-save-load.html");

  // The client module throws on any broken invariant, so reaching its completion marker means the byte-stability
  // assertions held. A thrown error fails this test via the console/page error fixture in testUtils, exactly as
  // it does for the other GPU suites.
  //
  // The marker carries the number of scenarios that actually finished, and the client asserts that count itself.
  // This suite waits for all three rather than "more than zero": a save/load regression can leave one scenario
  // passing (the non-vacuity precondition needs no restoration to be correct), so partial completion must not
  // read as green.
  await page.waitForFunction(
    () =>
      Number(document.body.dataset.sedimentSaveLoadTestsComplete ?? "0") >= 3,
    null,
    { timeout: 180_000 },
  );
});
