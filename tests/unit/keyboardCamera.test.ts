import { expect, test } from "@playwright/test";
import {
  applySprintMultiplier,
  applyZoomFactor,
  approachValue,
  CAMERA_KEY_BINDINGS,
  clampFrameDelta,
  clampToRange,
  combinePanInput,
  computeOrbitAngle,
  computeTiltAngle,
  computeZoomFactor,
  createPanBasis,
  MAX_FRAME_DELTA_SECONDS,
  scalePanSpeedToZoom,
  shouldHandleCameraKey,
  sumIntents,
  transformPanDirection,
} from "src/renderer/camera/cameraMotion";

/** Build a key press record; only the fields the guard inspects matter. */
const keyPressed = (
  overrides: Partial<Parameters<typeof shouldHandleCameraKey>[0]> = {},
) => ({
  code: "KeyW",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isTextEntryTarget: false,
  ...overrides,
});

test.describe("frame delta sanitising", () => {
  test("passes a normal frame through untouched", () => {
    expect(clampFrameDelta(1 / 60)).toBeCloseTo(1 / 60, 12);
  });

  test("caps long frames so a stalled tab cannot teleport the camera", () => {
    expect(clampFrameDelta(5)).toBe(MAX_FRAME_DELTA_SECONDS);
  });

  test("rejects negative, zero and non-finite deltas", () => {
    expect(clampFrameDelta(-1)).toBe(0);
    expect(clampFrameDelta(0)).toBe(0);
    expect(clampFrameDelta(Number.NaN)).toBe(0);
    expect(clampFrameDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

test.describe("pan basis", () => {
  test("looking down -Z yields right = +X for a Y-up frame", () => {
    const basis = createPanBasis({ x: 0, z: -1 });

    expect(basis.forward.x).toBeCloseTo(0);
    expect(basis.forward.z).toBeCloseTo(-1);
    expect(basis.right.x).toBeCloseTo(1);
    expect(basis.right.z).toBeCloseTo(0);
  });

  test("normalises a non-unit view direction and keeps axes perpendicular", () => {
    const basis = createPanBasis({ x: 3, z: -3 });

    expect(Math.hypot(basis.forward.x, basis.forward.z)).toBeCloseTo(1);
    expect(Math.hypot(basis.right.x, basis.right.z)).toBeCloseTo(1);
    expect(
      basis.forward.x * basis.right.x + basis.forward.z * basis.right.z,
    ).toBeCloseTo(0);
  });

  test("falls back to world axes when looking straight down", () => {
    // A top-down view flattens to a zero-length vector on the XZ plane.
    const basis = createPanBasis({ x: 0, z: 0 });

    expect(basis.forward).toEqual({ x: 0, z: -1 });
    expect(basis.right).toEqual({ x: 1, z: 0 });
  });

  test("survives a non-finite direction", () => {
    const basis = createPanBasis({ x: Number.NaN, z: 0 });

    expect(Number.isFinite(basis.forward.x)).toBe(true);
    expect(Number.isFinite(basis.right.z)).toBe(true);
  });

  test("transforming forward input reproduces the basis forward vector", () => {
    const basis = createPanBasis({ x: 1, z: -1 });
    const worldForward = transformPanDirection(
      { strafe: 0, forward: 1 },
      basis,
    );

    expect(worldForward.x).toBeCloseTo(basis.forward.x);
    expect(worldForward.z).toBeCloseTo(basis.forward.z);
  });

  test("an orthonormal basis preserves input magnitude, so partial ramps survive", () => {
    // Guards the resource layer: pan vectors must not be renormalised, or held
    // keys would snap to full speed instead of easing in.
    const basis = createPanBasis({ x: 0.4, z: -0.9 });
    const partialInput = combinePanInput(0.5, 0.35);
    const worldPan = transformPanDirection(partialInput, basis);

    expect(Math.hypot(worldPan.x, worldPan.z)).toBeCloseTo(
      Math.hypot(partialInput.strafe, partialInput.forward),
    );
    expect(Math.hypot(worldPan.x, worldPan.z)).toBeLessThan(1);
  });

  test("strafing right is perpendicular to forward and never touches Y", () => {
    const basis = createPanBasis({ x: 0, z: -1 });
    const worldRight = transformPanDirection({ strafe: 1, forward: 0 }, basis);

    expect(worldRight).toEqual({ x: 1, z: 0 });
  });
});

test.describe("diagonal input", () => {
  test("a single axis keeps full magnitude", () => {
    expect(combinePanInput(0, 1)).toEqual({ strafe: 0, forward: 1 });
    expect(combinePanInput(-1, 0)).toEqual({ strafe: -1, forward: 0 });
  });

  test("a diagonal is normalised so it is not faster than one key", () => {
    const diagonal = combinePanInput(1, 1);

    expect(Math.hypot(diagonal.strafe, diagonal.forward)).toBeCloseTo(1);
    expect(diagonal.strafe).toBeLessThan(1);
  });

  test("zero input stays zero rather than becoming NaN", () => {
    expect(combinePanInput(0, 0)).toEqual({ strafe: 0, forward: 0 });
  });
});

test.describe("screen-consistent pan speed", () => {
  test("higher zoom divides the world speed so screen feel is constant", () => {
    const atOne = scalePanSpeedToZoom(10, 1);
    const atFour = scalePanSpeedToZoom(10, 4);

    expect(atOne).toBeCloseTo(10);
    expect(atFour).toBeCloseTo(2.5);
  });

  test("a broken zoom value cannot divide by zero", () => {
    expect(Number.isFinite(scalePanSpeedToZoom(10, 0))).toBe(true);
    expect(Number.isFinite(scalePanSpeedToZoom(10, Number.NaN))).toBe(true);
  });
});

test.describe("ramp and glide", () => {
  test("converges monotonically toward the target", () => {
    let value = 0;
    const samples: number[] = [];

    for (let frame = 0; frame < 20; frame++) {
      value = approachValue(value, 1, 12, 1 / 60);
      samples.push(value);
    }

    expect(samples[0]).toBeGreaterThan(0);
    expect(
      samples.every(
        (sample, index) => index === 0 || sample >= samples[index - 1],
      ),
    ).toBe(true);
    // After 20 frames at rate 12/s the ramp has closed 1 - e^-4 of the distance.
    expect(samples[samples.length - 1]).toBeGreaterThan(0.98);
    expect(samples[samples.length - 1]).toBeLessThanOrEqual(1);
  });

  test("glides out toward zero after release instead of stopping instantly", () => {
    const released = approachValue(1, 0, 12, 1 / 60);

    expect(released).toBeLessThan(1);
    expect(released).toBeGreaterThan(0.5);
  });

  test("is a no-op without elapsed time", () => {
    expect(approachValue(0.4, 1, 12, 0)).toBe(0.4);
  });

  test("adopts the target when the current value is not finite", () => {
    expect(approachValue(Number.NaN, 1, 12, 1 / 60)).toBe(1);
  });

  test("is stable once at the target", () => {
    expect(approachValue(1, 1, 12, 1 / 30)).toBe(1);
  });
});

test.describe("orbit, tilt and zoom", () => {
  test("orbit angle scales with direction, speed and elapsed time", () => {
    expect(computeOrbitAngle(1, 2, 0.5)).toBeCloseTo(1);
    expect(computeOrbitAngle(-1, 2, 0.5)).toBeCloseTo(-1);
    expect(computeOrbitAngle(1, 2, 0)).toBe(0);
  });

  test("tilt angle scales with direction, speed and elapsed time", () => {
    expect(computeTiltAngle(1, 2, 0.5)).toBeCloseTo(1);
    expect(computeTiltAngle(-1, 2, 0.5)).toBeCloseTo(-1);
    expect(computeTiltAngle(1, 2, 0)).toBe(0);
  });

  test("sprint multiplies magnitude and can be disabled", () => {
    expect(applySprintMultiplier(2, true, 3)).toBeCloseTo(6);
    expect(applySprintMultiplier(2, false, 3)).toBeCloseTo(2);
    // A negative direction keeps its sign so reversing still works while sprinting.
    expect(applySprintMultiplier(-2, true, 3)).toBeCloseTo(-6);
  });

  test("R and F are reciprocal factors over the same interval", () => {
    const zoomIn = computeZoomFactor(1, 1.5, 0.2);
    const zoomOut = computeZoomFactor(-1, 1.5, 0.2);

    expect(zoomIn * zoomOut).toBeCloseTo(1);
    expect(zoomIn).toBeGreaterThan(1);
  });

  test("no zoom intent means no magnification change", () => {
    expect(computeZoomFactor(0, 1.5, 1)).toBeCloseTo(1);
  });

  test("zoom clamps to the controls' limits at both ends", () => {
    expect(applyZoomFactor(8, 2, 1, 8)).toBe(8);
    expect(applyZoomFactor(1, 0.5, 1, 8)).toBe(1);
    expect(applyZoomFactor(4, 1.1, 1, 8)).toBeCloseTo(4.4);
  });

  test("clamp helper respects an inclusive range", () => {
    expect(clampToRange(5, 0, 10)).toBe(5);
    expect(clampToRange(-5, 0, 10)).toBe(0);
    expect(clampToRange(50, 0, 10)).toBe(10);
  });
});

test.describe("held-key intent", () => {
  test("binds the documented key set", () => {
    expect(Object.keys(CAMERA_KEY_BINDINGS).sort()).toEqual([
      "KeyA",
      "KeyD",
      "KeyE",
      "KeyF",
      "KeyQ",
      "KeyR",
      "KeyS",
      "KeyW",
      "KeyX",
      "KeyZ",
    ]);
  });

  test("forward and back cancel out when both are held", () => {
    expect(sumIntents(["KeyW", "KeyS"]).forward).toBe(0);
    expect(sumIntents(["KeyA", "KeyD"]).strafe).toBe(0);
  });

  test("Z orbits left and X orbits right as equal and opposite intent", () => {
    expect(CAMERA_KEY_BINDINGS.KeyZ.orbit).toBe(1);
    expect(CAMERA_KEY_BINDINGS.KeyX.orbit).toBe(-1);
    // Orbit keys must not disturb the other axes.
    expect(CAMERA_KEY_BINDINGS.KeyZ).toMatchObject({
      strafe: 0,
      forward: 0,
      tilt: 0,
      zoom: 0,
    });
  });

  test("unbound keys contribute nothing", () => {
    expect(sumIntents(["Escape", "Space"])).toEqual({
      strafe: 0,
      forward: 0,
      orbit: 0,
      tilt: 0,
      zoom: 0,
    });
  });

  test("opposing axes compose independently", () => {
    const intent = sumIntents(["KeyW", "KeyD", "KeyE", "KeyF"]);

    expect(intent).toEqual({
      strafe: 1,
      forward: 1,
      orbit: 0,
      tilt: 1,
      zoom: -1,
    });
  });

  test("opposing orbit keys cancel, and the axis stays unit-capped", () => {
    const intent = sumIntents(["KeyW", "KeyZ", "KeyX"]);

    expect(intent.forward).toBe(1);
    expect(intent.orbit).toBe(0);
    // heldCodes is a Set, so repeats cannot reach sumIntents in production; these
    // pin the clamp itself for the axis.
    expect(sumIntents(["KeyZ", "KeyZ"]).orbit).toBe(1);
    expect(sumIntents(["KeyX", "KeyX"]).orbit).toBe(-1);
  });

  test("intent never exceeds unit magnitude per axis on absurd key rollovers", () => {
    const intent = sumIntents(["KeyW", "KeyW", "KeyE"]);

    expect(intent.forward).toBeLessThanOrEqual(1);
    expect(intent.tilt).toBeLessThanOrEqual(1);
  });
});

test.describe("key hygiene", () => {
  test("accepts bound camera keys", () => {
    expect(shouldHandleCameraKey(keyPressed())).toBe(true);
    expect(shouldHandleCameraKey(keyPressed({ code: "KeyR" }))).toBe(true);
  });

  test("ignores unbound keys so browser shortcuts survive", () => {
    expect(shouldHandleCameraKey(keyPressed({ code: "KeyC" }))).toBe(false);
    expect(shouldHandleCameraKey(keyPressed({ code: "F5" }))).toBe(false);
  });

  test("never hijacks typing in the React UI or terrain painting fields", () => {
    expect(shouldHandleCameraKey(keyPressed({ isTextEntryTarget: true }))).toBe(
      false,
    );
    // Z is a bound orbit key, so typing "z" into a field must still be exempt.
    expect(
      shouldHandleCameraKey(
        keyPressed({ code: "KeyZ", isTextEntryTarget: true }),
      ),
    ).toBe(false);
  });

  test("lets modifier combinations through to their real owner", () => {
    expect(shouldHandleCameraKey(keyPressed({ metaKey: true }))).toBe(false);
    expect(shouldHandleCameraKey(keyPressed({ ctrlKey: true }))).toBe(false);
    expect(shouldHandleCameraKey(keyPressed({ altKey: true }))).toBe(false);
    // Ctrl+Z stays an undo shortcut rather than a camera command.
    expect(
      shouldHandleCameraKey(keyPressed({ code: "KeyZ", ctrlKey: true })),
    ).toBe(false);
    expect(
      shouldHandleCameraKey(keyPressed({ code: "KeyX", metaKey: true })),
    ).toBe(false);
  });

  test("shift is allowed through because it is this controller's sprint key", () => {
    // Shift is not part of the guard, only sprint state lives in the resource.
    expect(shouldHandleCameraKey(keyPressed())).toBe(true);
  });
});
