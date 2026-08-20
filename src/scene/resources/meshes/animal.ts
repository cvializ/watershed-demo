import * as THREE from "three";

/**
 * Radius of the animal sphere. Shared by the mesh factory and the system that
 * seats the animal on the terrain so both stay in sync with "the current size".
 */
export const ANIMAL_RADIUS = 0.3;

/**
 * Create a sphere mesh for animals
 */
export const createAnimalMeshResource = () => {
  const geometry = new THREE.SphereGeometry(ANIMAL_RADIUS, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b4513, // Brown color for the animal
    metalness: 0.1,
    roughness: 0.8,
  });
  const animalMesh = new THREE.Mesh(geometry, material);

  // Enable shadow casting from animals
  animalMesh.castShadow = true;
  animalMesh.receiveShadow = true;

  // Render after terrain (higher render order ensures it appears on top)
  animalMesh.renderOrder = 1;

  return animalMesh;
};
