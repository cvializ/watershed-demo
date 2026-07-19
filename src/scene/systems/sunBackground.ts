import * as THREE from "three";

import type { GameWorldContext } from "@/context";
import type { SceneSystem } from "@/scene/types";

/**
 * Updates the sun angle based on elapsed time
 */
const updateSunAngle = (world: GameWorldContext, dt: number): void => {
  world.sunAngle += world.sunSpeed * dt;

  // Keep angle within 0 to 2π range
  if (world.sunAngle >= Math.PI * 2) {
    world.sunAngle -= Math.PI * 2;
  }

  const radius = 25; // Distance from origin
  const inclination = Math.PI / 4; // 45 degrees - goes above and below terrain
  world.sunPosition.x = radius * Math.cos(world.sunAngle);
  world.sunPosition.y = radius * Math.sin(world.sunAngle) * Math.sin(inclination);
  world.sunPosition.z = radius * Math.sin(world.sunAngle) * Math.cos(inclination);
};

/**
 * Updates the sun's position in an orbit around the origin with inclination
 */
const updateSunPosition = (world: GameWorldContext, scene: THREE.Scene): void => {
  const sunLight = scene.getObjectByName("sun-light") as THREE.DirectionalLight;
  if (!sunLight) {
    return;
  }

  const { x, y, z } = world.sunPosition;
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

/**
 * Changes the scene background color based on sun position
 * Daytime colors when sun is above horizon (y > 0)
 * Nighttime colors when sun is below horizon (y <= 0)
 */
const updateBackground = (world: GameWorldContext, scene: THREE.Scene): void => {
  // Daytime colors (sun above horizon)
  const daySkyColor = new THREE.Color("#87CEEB"); // Sky blue
  const dayAmbientLight = 0.6;

  // Nighttime colors (sun below horizon)
  const nightSkyColor = new THREE.Color("#0a0a2e"); // Deep dark blue
  const nightAmbientLight = 0.1;

  const position = world.sunPosition;
  // Interpolate colors based on sun height for smooth transition
  const sunHeight = Math.max(0, position.y) / 25; // Normalize to 0-1 range
  const blend = Math.pow(sunHeight, 0.5); // Ease in for more dramatic transition

  // Interpolate between night and day colors
  const skyColor = new THREE.Color().lerpColors(nightSkyColor, daySkyColor, blend);
  const ambientIntensity = nightAmbientLight + (dayAmbientLight - nightAmbientLight) * blend;

  scene.background = skyColor;

  // Find ambient light and update its intensity
  for (const child of scene.children) {
    if (child instanceof THREE.AmbientLight) {
      child.intensity = ambientIntensity;
      break;
    }
  }
};

/**
 * Updates sun angle, position, and background color based on time of day
 */
export const sunBackgroundSystem: SceneSystem = (world, scene, dt): void => {
  updateSunAngle(world, dt);

  updateSunPosition(world, scene);

  updateBackground(world, scene);
};
