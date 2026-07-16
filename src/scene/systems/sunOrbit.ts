import * as THREE from "three";

import type { SceneSystem } from "@/scene/types";

/**
 * Updates the sun's position in an orbit around the origin with inclination
 * @param scene - The Three.js scene containing the sun light
 * @param _dt - Delta time (unused, kept for SceneSystem signature)
 */
export const sunOrbitSystem: SceneSystem = (world, scene, _dt): void => {
  const sunLight = scene.getObjectByName("sun-light") as THREE.DirectionalLight;
  if (!sunLight) {
    return;
  }

  // Orbital parameters
  const radius = 25; // Distance from origin
  const inclination = Math.PI / 4; // 45 degrees - goes above and below terrain

  // Use world.sunAngle for manual control, or fall back to time-based calculation
  const angle = world.sunAngle;

  // Calculate position with inclination (orbit tilted around X-axis)
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle) * Math.sin(inclination);
  const z = radius * Math.sin(angle) * Math.cos(inclination);

  // Update sun position - this is where the shadow camera will be placed
  sunLight.position.set(x, y, z);

  // Update sun sphere to follow the light
  const sunSphere = (scene as any).sunSphere as THREE.Mesh;
  if (sunSphere) {
    sunSphere.position.set(x, y, z);
  }

  // Point the sun light toward the center of the terrain (0, 0, 0)
  // This sets the direction of the parallel light rays
  sunLight.lookAt(0, 0, 0);

  // Update shadow camera to follow the light
  const shadowCamera = sunLight.shadow.camera as THREE.OrthographicCamera;
  if (shadowCamera) {
    // Position the shadow camera at the light's position
    shadowCamera.position.copy(sunLight.position);

    // Look at the same target as the light (origin)
    shadowCamera.lookAt(0, 0, 0);

    // Update the projection matrix
    shadowCamera.updateProjectionMatrix();
  }
};
