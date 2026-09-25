/**
 * Pure maths for keyboard camera control.
 *
 * Everything here is free of DOM and three.js *state* (the only three.js
 * reference is a type-only import) so the feel of the controls — ramps, clamps,
 * screen-space scaling, key hygiene — can be unit tested in isolation. The
 * resource layer in `src/renderer/resources/keyboardCamera.ts` owns listeners and
 * applies the values computed here to the live camera and OrbitControls.
 */
import type * as THREE from "three";

/** A direction or offset restricted to the horizontal world plane (X/Z). */
export type PlaneVector = { x: number; z: number };

/** Cameras whose magnification is driven by the orthographic `zoom` property. */
export type ZoomableCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

/** Orthonormal basis used to translate WASD input into world-plane movement. */
export type PanBasis = { forward: PlaneVector; right: PlaneVector };

/** Raw stick-style pan input, each component in `[-1, 1]`. */
export type StrafeForward = { strafe: number; forward: number };

/** Normalised intent for one control frame, each axis in `[-1, 1]`. */
export type AxisIntent = {
  strafe: number;
  forward: number;
  /** Orbit the eye around the pivot horizontally (azimuth). */
  orbit: number;
  tilt: number;
  zoom: number;
};

/** The subset of a keyboard event needed to decide whether the camera reacts. */
export type CameraKeyPress = {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isTextEntryTarget: boolean;
};

/** Longest frame delta trusted from the clock, in seconds (~20fps floor). */
export const MAX_FRAME_DELTA_SECONDS = 0.05;

/** Smallest zoom accepted when converting pan speed to screen-space feel. */
const MIN_ZOOM_FOR_PAN = 0.01;

/** Intent produced by a key that is not bound to the camera. */
const NEUTRAL_INTENT: AxisIntent = {
  strafe: 0,
  forward: 0,
  orbit: 0,
  tilt: 0,
  zoom: 0,
};

/**
 * Key bindings keyed on `KeyboardEvent.code`, which is physical key position and
 * therefore layout independent (AZERTY users get the same reach as QWERTY).
 *
 * - W/S: pan forward/back along the camera's view direction flattened to XZ.
 * - A/D: strafe left/right across that plane.
 * - Q/E: orbit the eye left/right around the pivot at constant radius.
 * - F/R: tilt the eye up toward top-down / down toward the horizon around the pivot.
 * - Z/X: zoom in/out (orthographic frustum magnification).
 */
export const CAMERA_KEY_BINDINGS: Readonly<Record<string, AxisIntent>> = {
  KeyW: { strafe: 0, forward: 1, orbit: 0, tilt: 0, zoom: 0 },
  KeyS: { strafe: 0, forward: -1, orbit: 0, tilt: 0, zoom: 0 },
  KeyA: { strafe: -1, forward: 0, orbit: 0, tilt: 0, zoom: 0 },
  KeyD: { strafe: 1, forward: 0, orbit: 0, tilt: 0, zoom: 0 },
  KeyQ: { strafe: 0, forward: 0, orbit: 1, tilt: 0, zoom: 0 },
  KeyE: { strafe: 0, forward: 0, orbit: -1, tilt: 0, zoom: 0 },
  KeyF: { strafe: 0, forward: 0, orbit: 0, tilt: 1, zoom: 0 },
  KeyR: { strafe: 0, forward: 0, orbit: 0, tilt: -1, zoom: 0 },
  KeyZ: { strafe: 0, forward: 0, orbit: 0, tilt: 0, zoom: 1 },
  KeyX: { strafe: 0, forward: 0, orbit: 0, tilt: 0, zoom: -1 },
};

/** Clamp a value into an inclusive range. */
export const clampToRange = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(Math.max(value, minimum), maximum);

/**
 * Sanitise a frame delta so a stalled or backgrounded tab cannot teleport the
 * camera when it resumes, and non-finite clock values are ignored entirely.
 */
export const clampFrameDelta = (deltaSeconds: number): number => {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }

  return Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS);
};

/**
 * Build the pan basis from the camera's view direction flattened onto the XZ
 * plane. Panning this way stays flat at any tilt angle, unlike screen-space pan
 * which drifts upward as the viewer looks down.
 */
export const createPanBasis = (viewDirection: PlaneVector): PanBasis => {
  const length = Math.hypot(viewDirection.x, viewDirection.z);

  if (!Number.isFinite(length) || length < Number.EPSILON) {
    // Looking straight down: the flattened direction is degenerate, so fall
    // back to the world axes rather than dividing by zero.
    return { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } };
  }

  const forward: PlaneVector = {
    x: viewDirection.x / length,
    z: viewDirection.z / length,
  };

  // cross(flattenedView, worldUp) for a Y-up right-handed frame.
  return { forward, right: { x: -forward.z, z: forward.x } };
};

/**
 * Combine strafe/forward intent into a unit-capped plane direction, so holding
 * W and D together is not faster than holding either key alone.
 */
export const combinePanInput = (
  strafe: number,
  forward: number,
): StrafeForward => {
  const length = Math.hypot(strafe, forward);

  if (!Number.isFinite(length) || length <= 1) {
    return { strafe, forward };
  }

  return { strafe: strafe / length, forward: forward / length };
};

/** Rotate strafe/forward input into a world-plane direction. */
export const transformPanDirection = (
  input: StrafeForward,
  basis: PanBasis,
): PlaneVector => ({
  x: basis.right.x * input.strafe + basis.forward.x * input.forward,
  z: basis.right.z * input.strafe + basis.forward.z * input.forward,
});

/**
 * Convert a world-space pan speed into one that feels constant on screen by
 * dividing through the orthographic zoom (higher zoom magnifies, so a fixed
 * world distance covers more pixels).
 */
export const scalePanSpeedToZoom = (speed: number, zoom: number): number => {
  if (!Number.isFinite(zoom)) {
    // A broken zoom must not inflate the pan speed; fall back to unscaled motion.
    return speed;
  }

  return speed / Math.max(zoom, MIN_ZOOM_FOR_PAN);
};

/**
 * Move `current` toward `target` at an exponential rate. Produces the ramp-in
 * and glide-out that makes held keys feel analog instead of binary, and is
 * stable when the target equals the current value or no time has passed.
 */
export const approachValue = (
  current: number,
  target: number,
  ratePerSecond: number,
  deltaSeconds: number,
): number => {
  if (deltaSeconds <= 0 || !Number.isFinite(current) || ratePerSecond <= 0) {
    return Number.isFinite(current) ? current : target;
  }

  const blend = 1 - Math.exp(-ratePerSecond * deltaSeconds);

  return current + (target - current) * blend;
};

/** Multiply intent magnitude by the sprint multiplier when Shift is held. */
export const applySprintMultiplier = (
  value: number,
  isSprinting: boolean,
  sprintMultiplier: number,
): number => (isSprinting ? value * sprintMultiplier : value);

/** Multiplicative zoom factor for a frame; `direction` is in `[-1, 1]`. */
export const computeZoomFactor = (
  direction: number,
  ratePerSecond: number,
  deltaSeconds: number,
): number => Math.exp(direction * ratePerSecond * deltaSeconds);

/** Apply a zoom factor and keep the result inside the controls' zoom limits. */
export const applyZoomFactor = (
  currentZoom: number,
  factor: number,
  minimum: number,
  maximum: number,
): number => clampToRange(currentZoom * factor, minimum, maximum);

/** Signed change in an orbit angle for a frame, in radians. */
const computeAngularDelta = (
  direction: number,
  speedRadiansPerSecond: number,
  deltaSeconds: number,
): number => direction * speedRadiansPerSecond * deltaSeconds;

/** Signed change in azimuthal (orbit) angle for a frame, in radians. */
export const computeOrbitAngle = computeAngularDelta;

/** Signed change in polar (tilt) angle for a frame, in radians. */
export const computeTiltAngle = computeAngularDelta;

/** Sum the intent of every currently held camera key into one axis intent. */
export const sumIntents = (heldCodes: Iterable<string>): AxisIntent => {
  const total: AxisIntent = { ...NEUTRAL_INTENT };

  for (const code of heldCodes) {
    const binding = CAMERA_KEY_BINDINGS[code];

    if (!binding) {
      continue;
    }

    total.strafe += binding.strafe;
    total.forward += binding.forward;
    total.orbit += binding.orbit;
    total.tilt += binding.tilt;
    total.zoom += binding.zoom;
  }

  return {
    strafe: clampToRange(total.strafe, -1, 1),
    forward: clampToRange(total.forward, -1, 1),
    orbit: clampToRange(total.orbit, -1, 1),
    tilt: clampToRange(total.tilt, -1, 1),
    zoom: clampToRange(total.zoom, -1, 1),
  };
};

/**
 * Decide whether a key press should reach the camera. Text entry widgets and
 * modifier combinations are excluded so typing in the React UI and shortcuts such
 * as Cmd-R or Alt-D still reach their real owner. Shift is deliberately allowed:
 * it is this controller's speed modifier.
 */
export const shouldHandleCameraKey = (keyPress: CameraKeyPress): boolean => {
  if (
    keyPress.isTextEntryTarget ||
    keyPress.ctrlKey ||
    keyPress.metaKey ||
    keyPress.altKey
  ) {
    return false;
  }

  return Object.hasOwn(CAMERA_KEY_BINDINGS, keyPress.code);
};
