import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

let controls: OrbitControls | null = null;

export const getControls = () => controls;

export const updateControls = (dt: number) => {
  if (!controls) {
    return;
  }
  controls.update(dt);
};

/**
 * Create OrbitControls resource and store it in the cache
 */
export const createCameraControlsResource = (
  camera: THREE.Camera,
  domElement: HTMLElement,
) => {
  if (controls) {
    return controls;
  }

  controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.0;
  controls.target.set(0, 0, 0);

  // Limits shared by mouse wheel and the R/F keyboard zoom: OrbitControls applies
  // them to `camera.zoom` inside update(), so both input paths agree.
  controls.minZoom = 1;
  controls.maxZoom = 8;

  // Keep Q/E tilt above the horizon (the terrain plane is at y = 0) and away from
  // the poles, where panning and orbiting degenerate.
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;

  // Disable right-click rotation to allow terrain painting
  controls.enableRotate = false;

  return controls;
};

export const disposeCameraControls = () => {
  if (!controls) {
    return;
  }

  controls.disconnect();
  controls.dispose();
  controls = null;
};
