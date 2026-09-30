import * as THREE from "three";

import { logger } from "@/utils/logger";

/**
 * Depth the shadow camera must cover.
 *
 * The sun orbits on the star sphere (`STARFIELD_RADIUS` in
 * `meshes/starfield`, i.e. 75 units from the origin), so the orthographic
 * shadow camera has to reach that distance plus the terrain extent -
 * otherwise the scene falls outside the frustum and nothing is shaded.
 * Kept local (instead of importing the star radius) to avoid a resource
 * import cycle through the object cache.
 */
const SHADOW_CAMERA_FAR = 105;

/**
 * Create sun light (directional) with shadows
 */
export const createSunLightResource = () => {
  logger.info("[sun:light]");

  // Sun light (directional) with shadows
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(10, 20, 10);
  sunLight.castShadow = true;

  // Configure shadow map
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = SHADOW_CAMERA_FAR;
  sunLight.shadow.camera.left = -15;
  sunLight.shadow.camera.right = 15;
  sunLight.shadow.camera.top = 15;
  sunLight.shadow.camera.bottom = -15;

  return sunLight;
};
