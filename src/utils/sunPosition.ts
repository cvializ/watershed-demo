import * as THREE from "three";

export type SunPosition = {
  x: number;
  y: number;
  z: number;
};

/**
 * Updates the sun light's position and rotation based on spherical coordinates
 * @param light - The directional light to update
 * @param position - The sun position as an object with x, y, z coordinates
 */
export const updateSunLightFromPosition = (
  light: THREE.DirectionalLight,
  position: SunPosition,
): void => {
  light.position.set(position.x, position.y, position.z);

  // Point the sun light toward the center of the terrain (0, 0, 0)
  light.lookAt(0, 0, 0);
};

/**
 * Creates a new sun light with the given position
 * @param position - Initial sun position
 * @returns A new directional light configured as a sun
 */
export const createSunLight = (position: SunPosition): THREE.DirectionalLight => {
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  updateSunLightFromPosition(sunLight, position);

  // Configure shadow map
  sunLight.castShadow = true;
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