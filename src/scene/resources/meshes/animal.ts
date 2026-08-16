import * as THREE from "three";

/**
 * Create a sphere mesh for animals
 */
export const createAnimalMeshResource = () => {
  const geometry = new THREE.SphereGeometry(0.3, 16, 16);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Brown color for the animal
    metalness: 0.1,
    roughness: 0.8,
  });
  const animalMesh = new THREE.Mesh(geometry, material);

  return animalMesh;
};