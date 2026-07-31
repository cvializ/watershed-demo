import * as THREE from "three";

export const createDefaultMaterialResource = () => {
  return new THREE.MeshPhongMaterial({
    color: 0x8b4513, // Brownish terrain color
    flatShading: false,
  }) as THREE.MeshPhongMaterial;
};
