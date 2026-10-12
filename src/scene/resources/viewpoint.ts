import * as THREE from "three";

/**
 * Per-entity first-person cameras for viewpoints.
 *
 * Mirrors the `meshInstances` pattern: unlike shared singleton resources
 * (`MeshEnum`/`GeneralObjectEnum`) that are reused across entities through the
 * object cache, each viewpoint entity owns its own `THREE.PerspectiveCamera`
 * so several standpoints can coexist and be switched between. Only the active
 * viewpoint's camera is ever used to render, so at most one camera is live per
 * frame, but every placed viewpoint keeps its own so you can jump back.
 */

/** Vertical gap between the terrain surface and the eye, in world units. */
export const VIEWPOINT_EYE_HEIGHT = 1.7;

/** Horizontal field of view for a first-person camera, in degrees. */
const FIRST_PERSON_FOV = 70;

/** Near/far clipping for a first-person camera, in world units. */
const FIRST_PERSON_NEAR = 0.1;
const FIRST_PERSON_FAR = 4000;

/** Live per-entity viewpoint cameras, keyed by entity id. */
const viewpointCameras = new Map<number, THREE.PerspectiveCamera>();

/**
 * Create a fresh first-person perspective camera sized to the current viewport.
 */
export const createFirstPersonCamera = (): THREE.PerspectiveCamera => {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 720;
  const aspect = height > 0 ? width / height : 16 / 9;

  return new THREE.PerspectiveCamera(
    FIRST_PERSON_FOV,
    aspect,
    FIRST_PERSON_NEAR,
    FIRST_PERSON_FAR,
  );
};

/**
 * Register a first-person camera for a viewpoint entity.
 */
export const setViewpointCamera = (
  entity$: number,
  camera: THREE.PerspectiveCamera,
): void => {
  viewpointCameras.set(entity$, camera);
};

/**
 * Get the per-entity first-person camera for a viewpoint, if one exists.
 */
export const getViewpointCamera = (
  entity$: number,
): THREE.PerspectiveCamera | undefined => viewpointCameras.get(entity$);

/**
 * Whether a viewpoint entity already owns a first-person camera.
 */
export const hasViewpointCamera = (entity$: number): boolean =>
  viewpointCameras.has(entity$);

/**
 * Forget a viewpoint's camera so it can be recreated (e.g. on entity remove).
 */
export const removeViewpointCamera = (entity$: number): void => {
  viewpointCameras.delete(entity$);
};

/**
 * Drop every cached viewpoint camera. Intended for tests.
 */
export const resetViewpointCameras = (): void => {
  viewpointCameras.clear();
};