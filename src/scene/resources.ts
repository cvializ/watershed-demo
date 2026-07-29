import * as THREE from "three";

import { logger } from "@/utils/logger";

export const createSceneResource = () => {
  logger.info("[scene:resource]");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#87CEEB"); // Sky blue

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  return scene;
};
