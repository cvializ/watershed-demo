import { test } from "./testUtils";

test("gpu-water-quality page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-gpu-water-quality.html");

  // The client module throws on any broken invariant, so reaching its completion marker means the transport,
  // conservation and source assertions held. A thrown error fails this test through the console/page error
  // fixture in testUtils, exactly as it does for the other GPU suites.
  //
  // The marker carries the number of scenarios that actually finished (the page asserts that count itself), so a
  // pass needs evidence of work rather than merely a statement having executed.
  await page.waitForFunction(
    () => Number(document.body.dataset.waterQualityTestsComplete ?? "0") > 0,
    null,
    { timeout: 120_000 },
  );
});
