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

export const getMesh = (scene: THREE.Scene, meshId: number): THREE.Mesh | null => {
  const mesh = scene.getObjectById(meshId);
  if (!mesh) {
    return null;
  }

  return mesh as THREE.Mesh;
};
