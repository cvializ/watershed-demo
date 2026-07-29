import * as THREE from "three";

import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { setObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const createSunLightResource = () => {
  logger.info("[sunLight:resource]");

  // Sun light (directional) with shadows
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
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

  return sunLight;
};
