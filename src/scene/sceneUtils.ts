import * as THREE from "three";

export const getCamera = (scene: THREE.Scene): THREE.Camera | null => {
  const [cam] = scene.getObjectsByProperty(
    "type",
    "OrthographicCamera",
  ) as THREE.OrthographicCamera[];
  if (!cam) {
    return null;
  }
  return cam;
};
