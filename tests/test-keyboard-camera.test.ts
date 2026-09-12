import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";

import { test } from "./testUtils";

/** Hold a key long enough for several animation frames to apply it. */
const holdKey = async (page: Page, code: string) => {
  // Playwright's keyboard.press with a delay emits real down/up across frames.
  await page.keyboard.press(code, { delay: 180 });
};

/**
 * Dispatch a cancelable key event at the window and report whether the camera
 * controller claimed it via preventDefault. This proves the listener wiring is
 * live without exposing any application state as a global.
 */
const wasCameraKeyClaimed = (page: Page, code: string): Promise<boolean> =>
  page.evaluate((keyCode: string) => {
    const press = new KeyboardEvent("keydown", {
      code: keyCode,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(press);

    // Release immediately so the synthetic probe leaves no held-key state.
    window.dispatchEvent(
      new KeyboardEvent("keyup", { code: keyCode, bubbles: true }),
    );

    return press.defaultPrevented;
  }, code);

test("keyboard camera control runs without errors", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15000 });

  // Each group owns one orbit quantity, so exercise every group plus sprint and
  // a combined hold. Any throw inside the per-frame keyboard update surfaces as
  // a page error, which this harness turns into a test failure.
  await holdKey(page, "KeyW");
  await holdKey(page, "KeyA");
  await holdKey(page, "KeyS");
  await holdKey(page, "KeyD");
  await holdKey(page, "KeyZ");
  await holdKey(page, "KeyX");
  await holdKey(page, "KeyQ");
  await holdKey(page, "KeyE");
  await holdKey(page, "KeyR");
  await holdKey(page, "KeyF");

  await page.keyboard.down("ShiftLeft");
  await page.keyboard.press("KeyW", { delay: 120 });
  await page.keyboard.up("ShiftLeft");

  // A combined hold: strafe + forward + orbit + tilt + zoom in the same frames.
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyZ");
  await page.keyboard.down("KeyE");
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(300);
  for (const code of ["KeyR", "KeyE", "KeyZ", "KeyD", "KeyW"]) {
    await page.keyboard.up(code);
  }

  // Unbound keys and shift-modified keys must reach the page without upsetting
  // the controller. (Modifier gating itself is covered in tests/unit.)
  await page.keyboard.press("KeyC");
  await page.keyboard.press("Shift+KeyD", { delay: 120 });

  await expect(canvas).toBeVisible();

  // Wiring assertions: bound keys are claimed, unbound ones are left alone.
  expect(await wasCameraKeyClaimed(page, "KeyW")).toBe(true);
  expect(await wasCameraKeyClaimed(page, "KeyZ")).toBe(true);
  expect(await wasCameraKeyClaimed(page, "KeyX")).toBe(true);
  expect(await wasCameraKeyClaimed(page, "KeyE")).toBe(true);
  expect(await wasCameraKeyClaimed(page, "KeyG")).toBe(false);

  // Typing into a field must never move the camera.
  const claimedWhileTyping = await page.evaluate(() => {
    const textField = document.createElement("input");
    document.body.append(textField);
    textField.focus();

    const press = new KeyboardEvent("keydown", {
      code: "KeyW",
      bubbles: true,
      cancelable: true,
    });
    textField.dispatchEvent(press);
    textField.remove();

    return press.defaultPrevented;
  });
  expect(claimedWhileTyping).toBe(false);
});
