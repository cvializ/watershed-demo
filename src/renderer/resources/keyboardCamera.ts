import type { OrbitControls } from "three/examples/jsm/Addons.js";

import * as THREE from "three";
import { hasComponent } from "bitecs";

import type { GameWorldContext } from "@/context";
import { Orientation, Position } from "@/components/components";
import { resolveActiveViewpointCamera } from "@/renderer/camera/viewpoint";
import type { ZoomableCamera } from "@/renderer/camera/cameraMotion";

import {
  applySprintMultiplier,
  applyZoomFactor,
  approachValue,
  clampFrameDelta,
  clampViewpointPitch,
  combinePanInput,
  computeLiftDelta,
  computeOrbitAngle,
  computeTiltAngle,
  computeZoomFactor,
  createPanBasis,
  scalePanSpeedToZoom,
  shouldHandleCameraKey,
  sumIntents,
  transformPanDirection,
} from "@/renderer/camera/cameraMotion";
import { logger } from "@/utils/logger";

/** Tunable feel of the keyboard camera. Exposed later for a controls panel. */
const TUNING = {
  /** World units per second at zoom 1, divided by zoom for constant screen speed. */
  panSpeed: 14,
  /** Radians per second that Q/E orbit the eye around the pivot. */
  orbitSpeedRadiansPerSecond: 0.9,
  /** Radians per second that F/R tilt the eye around the pivot. */
  tiltSpeedRadiansPerSecond: 1.1,
  /** Exponential zoom rate per second for Z/X. */
  zoomRatePerSecond: 1.5,
  /** Radians per second that A/D yaw a first-person viewpoint horizontally. */
  viewpointYawSpeedRadiansPerSecond: 1.2,
  /** Radians per second that W/S pitch a first-person viewpoint up/down. */
  viewpointPitchSpeedRadiansPerSecond: 0.9,
  /** World units per second that Q/E lower/raise a first-person viewpoint. */
  viewpointLiftSpeedUnitsPerSecond: 5,
  /** Pitch magnitude cap (radians) for first-person viewpoints. */
  viewpointMaxPitchRadians: Math.PI / 2 - 0.03,
  /** How quickly held keys ramp up and release glides out (per second). */
  rampRatePerSecond: 12,
  /** Speed multiplier while Shift is held. */
  sprintMultiplier: 3,
  /** Idle time before auto-rotate resumes after manual control. */
  autoRotateResumeDelayMs: 2000,
} as const;

/** Tags of elements whose text entry must never be hijacked by camera keys. */
const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Smallest residual intent worth applying, below which idle frames do no work. */
const INTENT_EPSILON = 1e-4;

/** Module singleton: one keyboard-driven camera per page. */
let controller: KeyboardCameraController | null = null;

type KeyboardCameraController = {
  camera: ZoomableCamera;
  controls: OrbitControls;
  /** The game context (itself an ECS world), for active-viewpoint look-around. */
  context: GameWorldContext;
  heldCodes: Set<string>;
  /** Smoothed intent components, driven toward the pressed-key target each frame. */
  smoothedStrafe: number;
  smoothedForward: number;
  smoothedOrbit: number;
  smoothedTilt: number;
  smoothedZoom: number;
  smoothedLift: number;
  isSprinting: boolean;
  autoRotateEnabledByDefault: boolean;
  autoRotateResumeAt: number;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleKeyUp: (event: KeyboardEvent) => void;
  handleWindowBlur: () => void;
  handleVisibilityChange: () => void;
};

/** True when keyboard focus sits inside a widget that consumes typed characters. */
const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || TEXT_ENTRY_TAGS.has(target.tagName);
};

/** Forget every held key so nothing stays stuck after an alt-tab or tab switch. */
const releaseAllKeys = (controller: KeyboardCameraController): void => {
  const hadHeldKeys = controller.heldCodes.size > 0;
  controller.heldCodes.clear();
  controller.isSprinting = false;

  if (hadHeldKeys) {
    scheduleAutoRotateResume(controller);
  }
};

/** Let auto-rotate take over again once the pilot has been idle for a while. */
const scheduleAutoRotateResume = (
  controller: KeyboardCameraController,
): void => {
  if (!controller.autoRotateEnabledByDefault) {
    return;
  }

  controller.autoRotateResumeAt =
    performance.now() + TUNING.autoRotateResumeDelayMs;
};

/** Manual input outranks auto-rotate, otherwise the two fight within a frame. */
const suspendAutoRotate = (controller: KeyboardCameraController): void => {
  controller.controls.autoRotate = false;
  controller.autoRotateResumeAt = Number.POSITIVE_INFINITY;
};

/** Shift is tracked as a speed modifier rather than as a camera binding. */
const isShiftCode = (code: string): boolean =>
  code === "ShiftLeft" || code === "ShiftRight";

const handleKeyDown = (
  controller: KeyboardCameraController,
  event: KeyboardEvent,
): void => {
  // Auto-repeat arrives from the held-key set already, so OS repeats are noise.
  if (event.repeat) {
    return;
  }

  const isTyping = isTextEntryTarget(event.target);

  if (isTyping) {
    return;
  }

  if (isShiftCode(event.code)) {
    controller.isSprinting = true;
    return;
  }

  const accepted = shouldHandleCameraKey({
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    isTextEntryTarget: isTyping,
  });

  if (!accepted) {
    return;
  }

  // Stop the browser's own behaviour for bound keys (e.g. quick-find in Firefox).
  event.preventDefault();

  controller.heldCodes.add(event.code);
  suspendAutoRotate(controller);
};

const handleKeyUp = (
  controller: KeyboardCameraController,
  event: KeyboardEvent,
): void => {
  if (isShiftCode(event.code)) {
    controller.isSprinting = false;
    return;
  }

  if (
    controller.heldCodes.delete(event.code) &&
    controller.heldCodes.size === 0
  ) {
    scheduleAutoRotateResume(controller);
  }
};

/**
 * Rotate the active viewpoint's camera in place: `yawDelta` about the camera's
 * own up axis (positive looks left, matching a +Y rotation) and `pitchDelta`
 * about its right axis (positive looks up). Pitch is clamped so the viewer
 * can look straight up/down but never rolls over their head, and roll is
 * dropped so repeated adjustments never accumulate a lean.
 */
const applyViewpointLook = (
  camera: THREE.Camera,
  yawDelta: number,
  pitchDelta: number,
): void => {
  // YXZ order reads the camera's own yaw/pitch without gimbal interference for
  // the rotations this function applies.
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

  euler.y += yawDelta;
  euler.x = clampViewpointPitch(
    euler.x + pitchDelta,
    TUNING.viewpointMaxPitchRadians,
  );
  euler.z = 0;

  camera.quaternion.setFromEuler(euler);
};

/**
 * Copy a viewpoint camera's live state into its entity: the quaternion into
 * the `Orientation` component (so stored orientation tracks look-around
 * instead of freezing where the camera faced when it was created) and the
 * height into `Position.y` (so a raised or lowered viewpoint stays that way
 * and stored state matches the camera).
 */
const syncViewpointOrientation = (
  context: GameWorldContext,
  camera: THREE.Camera,
): void => {
  const viewpoint$ = context.activeViewpoint$;

  if (viewpoint$ < 0) {
    return;
  }

  if (hasComponent(context, viewpoint$, Orientation)) {
    Orientation.x[viewpoint$] = camera.quaternion.x;
    Orientation.y[viewpoint$] = camera.quaternion.y;
    Orientation.z[viewpoint$] = camera.quaternion.z;
    Orientation.w[viewpoint$] = camera.quaternion.w;
  }

  if (hasComponent(context, viewpoint$, Position)) {
    Position.y[viewpoint$] = camera.position.y;
  }
};

/** Apply the smoothed intent of this frame to camera position, angle and zoom. */
const applyIntent = (
  controller: KeyboardCameraController,
  deltaSeconds: number,
): void => {
  const { camera, controls } = controller;
  const panInput = combinePanInput(
    controller.smoothedStrafe,
    controller.smoothedForward,
  );

  // With a first-person viewpoint active the shared overhead camera is off
  // screen, so WASD rotates the viewpoint instead of panning it: A/D yaw
  // (strafe intent, sign flipped because +Y rotation looks left) and W/S
  // pitch (forward intent, +X rotation looks up). F/R lift the viewpoint
  // vertically (F lowers, R raises) and the result is written back to the
  // entity's Orientation/Position components. The remaining overhead keys
  // (Q/E orbit, Z/X zoom) stay inert here.
  const viewpointCamera = resolveActiveViewpointCamera(controller.context);
  if (viewpointCamera) {
    const yawDelta = applySprintMultiplier(
      -computeOrbitAngle(
        panInput.strafe,
        TUNING.viewpointYawSpeedRadiansPerSecond,
        deltaSeconds,
      ),
      controller.isSprinting,
      TUNING.sprintMultiplier,
    );
    const pitchDelta = applySprintMultiplier(
      computeTiltAngle(
        panInput.forward,
        TUNING.viewpointPitchSpeedRadiansPerSecond,
        deltaSeconds,
      ),
      controller.isSprinting,
      TUNING.sprintMultiplier,
    );
    const liftDelta = applySprintMultiplier(
      computeLiftDelta(
        controller.smoothedLift,
        TUNING.viewpointLiftSpeedUnitsPerSecond,
        deltaSeconds,
      ),
      controller.isSprinting,
      TUNING.sprintMultiplier,
    );

    if (yawDelta !== 0 || pitchDelta !== 0) {
      applyViewpointLook(viewpointCamera, yawDelta, pitchDelta);
    }

    if (liftDelta !== 0) {
      viewpointCamera.position.y += liftDelta;
    }

    if (yawDelta !== 0 || pitchDelta !== 0 || liftDelta !== 0) {
      syncViewpointOrientation(controller.context, viewpointCamera);
    }

    return;
  }

  if (panInput.strafe !== 0 || panInput.forward !== 0) {
    // OrbitControls re-derives its spherical offset from `position - target` on
    // every update, so moving the pair together cannot desync the controller and
    // keeps the orbit pivot travelling with the camera.
    const viewDirection = camera.getWorldDirection(new THREE.Vector3());
    const basis = createPanBasis({ x: viewDirection.x, z: viewDirection.z });
    const panDirection = transformPanDirection(panInput, basis);
    const speed = scalePanSpeedToZoom(
      applySprintMultiplier(
        TUNING.panSpeed,
        controller.isSprinting,
        TUNING.sprintMultiplier,
      ),
      camera.zoom,
    );

    // No normalise here: combinePanInput caps magnitude at 1 and the basis is
    // orthonormal, so scaling by the vector's own length preserves the ramp-in
    // and glide-out of the smoothed input. Normalising would snap to full speed.
    // No normalise here: combinePanInput caps magnitude at 1 and the basis is
    // orthonormal, so panDirection already carries the smoothed input's length in
    // (0, 1]. Normalising would snap to full speed; rescaling would square it.
    const panOffset = new THREE.Vector3(
      panDirection.x,
      0,
      panDirection.z,
    ).multiplyScalar(speed * deltaSeconds);

    camera.position.add(panOffset);
    controls.target.add(panOffset);
  }

  if (controller.smoothedOrbit !== 0) {
    const orbitAngle = applySprintMultiplier(
      computeOrbitAngle(
        controller.smoothedOrbit,
        TUNING.orbitSpeedRadiansPerSecond,
        deltaSeconds,
      ),
      controller.isSprinting,
      TUNING.sprintMultiplier,
    );

    // Positive angle feeds OrbitControls.rotateLeft, so the eye travels to the
    // viewer's left around the pivot at constant radius. Radius is untouched,
    // unlike panning, which carries the pivot along with the camera.
    controls.rotateLeft(orbitAngle);
  }

  if (controller.smoothedTilt !== 0) {
    const tiltAngle = applySprintMultiplier(
      computeTiltAngle(
        controller.smoothedTilt,
        TUNING.tiltSpeedRadiansPerSecond,
        deltaSeconds,
      ),
      controller.isSprinting,
      TUNING.sprintMultiplier,
    );

    // Positive angle reduces the polar angle (raising the eye toward top-down).
    // OrbitControls clamps the result to min/maxPolarAngle during its update.
    controls.rotateUp(tiltAngle);
  }

  if (controller.smoothedZoom !== 0) {
    const zoomFactor = computeZoomFactor(
      controller.smoothedZoom,
      TUNING.zoomRatePerSecond,
      deltaSeconds,
    );
    const nextZoom = applyZoomFactor(
      camera.zoom,
      zoomFactor,
      controls.minZoom,
      controls.maxZoom,
    );

    if (nextZoom !== camera.zoom) {
      camera.zoom = nextZoom;
      camera.updateProjectionMatrix();
    }
  }
};

/**
 * Create the keyboard camera controller and start listening. Call after the
 * OrbitControls resource exists; pairs with {@link disposeKeyboardCamera}.
 *
 * `context` is the game context (an ECS world): while a first-person
 * viewpoint is active, WASD looks around from that viewpoint instead of
 * panning the overhead camera.
 */
export const createKeyboardCameraResource = (
  camera: ZoomableCamera,
  controls: OrbitControls,
  context: GameWorldContext,
): KeyboardCameraController => {
  if (controller) {
    return controller;
  }

  const created: KeyboardCameraController = {
    camera,
    controls,
    context,
    heldCodes: new Set<string>(),
    smoothedStrafe: 0,
    smoothedForward: 0,
    smoothedOrbit: 0,
    smoothedTilt: 0,
    smoothedZoom: 0,
    smoothedLift: 0,
    isSprinting: false,
    autoRotateEnabledByDefault: controls.autoRotate,
    autoRotateResumeAt: Number.POSITIVE_INFINITY,
    handleKeyDown: (event) => handleKeyDown(created, event),
    handleKeyUp: (event) => handleKeyUp(created, event),
    handleWindowBlur: () => releaseAllKeys(created),
    handleVisibilityChange: () => {
      if (document.visibilityState === "hidden") {
        releaseAllKeys(created);
      }
    },
  };

  controller = created;

  window.addEventListener("keydown", created.handleKeyDown);
  window.addEventListener("keyup", created.handleKeyUp);
  window.addEventListener("blur", created.handleWindowBlur);
  document.addEventListener("visibilitychange", created.handleVisibilityChange);

  logger.info("[keyboard-camera:create]");

  return created;
};

/**
 * Advance the keyboard camera for one frame. Must run before `updateControls`
 * so the deltas settle inside the same OrbitControls damping step.
 */
export const updateKeyboardCamera = (dt: number): void => {
  if (!controller) {
    return;
  }

  const deltaSeconds = clampFrameDelta(dt);
  const intent = sumIntents(controller.heldCodes);
  const ramp = TUNING.rampRatePerSecond;

  controller.smoothedStrafe = approachValue(
    controller.smoothedStrafe,
    intent.strafe,
    ramp,
    deltaSeconds,
  );
  controller.smoothedForward = approachValue(
    controller.smoothedForward,
    intent.forward,
    ramp,
    deltaSeconds,
  );
  controller.smoothedOrbit = approachValue(
    controller.smoothedOrbit,
    intent.orbit,
    ramp,
    deltaSeconds,
  );
  controller.smoothedTilt = approachValue(
    controller.smoothedTilt,
    intent.tilt,
    ramp,
    deltaSeconds,
  );
  controller.smoothedZoom = approachValue(
    controller.smoothedZoom,
    intent.zoom,
    ramp,
    deltaSeconds,
  );
  controller.smoothedLift = approachValue(
    controller.smoothedLift,
    intent.lift,
    ramp,
    deltaSeconds,
  );

  // Snap tiny residuals to zero so idle frames do no work and never drift.
  if (
    intent.strafe === 0 &&
    Math.abs(controller.smoothedStrafe) < INTENT_EPSILON
  ) {
    controller.smoothedStrafe = 0;
  }
  if (
    intent.forward === 0 &&
    Math.abs(controller.smoothedForward) < INTENT_EPSILON
  ) {
    controller.smoothedForward = 0;
  }
  if (
    intent.orbit === 0 &&
    Math.abs(controller.smoothedOrbit) < INTENT_EPSILON
  ) {
    controller.smoothedOrbit = 0;
  }
  if (intent.tilt === 0 && Math.abs(controller.smoothedTilt) < INTENT_EPSILON) {
    controller.smoothedTilt = 0;
  }
  if (intent.zoom === 0 && Math.abs(controller.smoothedZoom) < INTENT_EPSILON) {
    controller.smoothedZoom = 0;
  }
  if (intent.lift === 0 && Math.abs(controller.smoothedLift) < INTENT_EPSILON) {
    controller.smoothedLift = 0;
  }

  applyIntent(controller, deltaSeconds);
  maybeResumeAutoRotate(controller);
};

/** Re-enable auto-rotate once an idle pilot has been away long enough. */
const maybeResumeAutoRotate = (controller: KeyboardCameraController): void => {
  if (controller.autoRotateResumeAt === Number.POSITIVE_INFINITY) {
    return;
  }

  if (performance.now() < controller.autoRotateResumeAt) {
    return;
  }

  controller.controls.autoRotate = controller.autoRotateEnabledByDefault;
  controller.autoRotateResumeAt = Number.POSITIVE_INFINITY;
};

/** Remove listeners and drop the singleton. */
export const disposeKeyboardCamera = (): void => {
  if (!controller) {
    return;
  }

  window.removeEventListener("keydown", controller.handleKeyDown);
  window.removeEventListener("keyup", controller.handleKeyUp);
  window.removeEventListener("blur", controller.handleWindowBlur);
  document.removeEventListener(
    "visibilitychange",
    controller.handleVisibilityChange,
  );

  releaseAllKeys(controller);
  controller.controls.autoRotate = controller.autoRotateEnabledByDefault;
  controller = null;

  logger.info("[keyboard-camera:dispose]");
};
