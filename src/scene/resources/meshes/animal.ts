import * as THREE from "three";

/**
 * Create a sphere mesh for animals
 */
export const createAnimalMeshResource = () => {
  const geometry = new THREE.SphereGeometry(0.3, 16, 16);
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
