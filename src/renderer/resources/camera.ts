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
