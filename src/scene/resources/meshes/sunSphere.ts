import * as THREE from "three";

/**
 * Create a sphere mesh for the sun
 */
export const createSunSphereResource = () => {
  const geometry = new THREE.SphereGeometry(0.5, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
  const sunSphere = new THREE.Mesh(geometry, material);

  // Always render the sun sphere regardless of frustum culling
  // This is necessary because the sun orbits on the star sphere (distance 75)
  // and its bounding volume can fall outside the orthographic frustum
  sunSphere.frustumCulled = false;

  return sunSphere;
};
