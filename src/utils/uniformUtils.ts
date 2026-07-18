import type * as THREE from "three";

/**
 * Helper function to safely get a uniform with type checking.
 * @param uniforms - The material uniforms object
 * @param name - The name of the uniform to retrieve
 * @returns The uniform object with properly typed value
 */
export const getUniforms = <T>(material: THREE.ShaderMaterial): T => {
  return material.uniforms as T;
};
