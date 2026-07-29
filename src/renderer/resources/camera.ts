import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

export const createCameraResource = () => {
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 20;
  const camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000,
  );
  camera.position.set(15, 12, 15);
  camera.zoom = 2.5;
  camera.updateProjectionMatrix();

  return camera;
};

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

export const getCameraControls = () => controls;

export const disposeCameraControls = () => {
  if (!controls) {
    return;
  }

  controls.disconnect();
  controls.dispose();
  controls = null;
};
