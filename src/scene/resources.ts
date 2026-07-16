import * as THREE from "three";

export const createSceneResource = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#87CEEB"); // Sky blue

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  // Sun light (directional) with shadows
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.name = "sun-light";
  sunLight.position.set(10, 20, 10);
  sunLight.castShadow = true;

  // Configure shadow map
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 50;
  sunLight.shadow.camera.left = -15;
  sunLight.shadow.camera.right = 15;
  sunLight.shadow.camera.top = 15;
  sunLight.shadow.camera.bottom = -15;

  scene.add(sunLight);

  return { scene, sunLight };
};
