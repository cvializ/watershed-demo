import * as THREE from "three";

/**
 * Create a mesh normal material for verification/debugging
 */
export const createNormalMaterialResource = () => {
  return new THREE.MeshNormalMaterial({});
};
