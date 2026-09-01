import { test } from "./testUtils";

test("gpu-sediment-flow page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-gpu-sediment-flow.html");

  // The client module throws on any broken invariant, so reaching its completion marker means the
  // conservation assertions held. A thrown error fails this test via the console/page error fixture in
  // testUtils, exactly as it does for the other GPU suites.
  //
  // The marker carries the number of scenarios that actually finished (the page asserts that count itself),
  // so a pass needs evidence of work rather than just a statement having executed - and any future refactor
  // that hoists the assignment above the assertions still has to survive that in-page count check.
  await page.waitForFunction(
    () => Number(document.body.dataset.sedimentFlowTestsComplete ?? "0") > 0,
    null,
    { timeout: 180_000 },
  );
});
