import * as THREE from "three";

/**
 * Create a sphere mesh for the sun
 */
export const createSunSphereResource = () => {
  const geometry = new THREE.SphereGeometry(0.5, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
  const sunSphere = new THREE.Mesh(geometry, material);

  // Always render the sun sphere regardless of frustum culling
  // This is necessary because the sun orbits at distance ~25 and may be culled
  sunSphere.frustumCulled = false;

  return sunSphere;
};