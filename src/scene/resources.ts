import * as THREE from "three";

export const createSceneResource = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ff7e3d");

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  return { scene };
};
