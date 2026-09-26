import { test } from "./testUtils";

test("gpu-water-quality page should load without errors", async ({ page }) => {
  await page.goto("/tests/test-gpu-water-quality.html");

  // The client module throws on any broken invariant, so reaching its completion marker means the transport,
  // conservation and source assertions held. A thrown error fails this test through the console/page error
  // fixture in testUtils, exactly as it does for the other GPU suites.
  //
  // The marker carries the number of scenarios that actually finished, and only appears once the page has asserted
  // that count against its own SCENARIO_COUNT. This waits for all of them (SCENARIO_COUNT in the client module is
  // 28 - bump both together): a green read off one finished scenario would hide every transport, conservation,
  // exchange and growth assertion that never got to run.
  await page.waitForFunction(
    () => Number(document.body.dataset.waterQualityTestsComplete ?? "0") >= 28,
    null,
    { timeout: 180_000 },
  );
});
