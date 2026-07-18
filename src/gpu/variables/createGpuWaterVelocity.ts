import type { GPUComputationRenderer, Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import { getUniforms } from "@/gpu/variables/uniformUtils";
import waterVelocityFragmentShader from "@/shaders/compute/water-velocity.frag?raw";

export interface WaterVelocityUniforms {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uWaterHeightmap: THREE.IUniform<THREE.Texture | null>;
}

/**
 * Creates an initial velocity texture with zero values for all cells.
 */
const createInitialVelocityTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 0.0; // vx
    data[i * 4 + 1] = 0.0; // vy
    data[i * 4 + 2] = 0.0; // magnitude (blue channel for debugging)
    data[i * 4 + 3] = 1.0; // alpha
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;

  return { texture, data };
};

export const createGpuWaterVelocity = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  heightMapTexture: THREE.Texture,
  waterHeightVariable: Variable,
) => {
  const { texture: velocityTexture } = createInitialVelocityTexture(width);
  const waterVelocityVariable = gpuCompute.addVariable(
    "waterVelocity",
    waterVelocityFragmentShader,
    velocityTexture,
  );

  gpuCompute.setVariableDependencies(waterVelocityVariable, [waterHeightVariable]);

  return {
    waterVelocityVariable,
    initWaterVelocity: () => {
      // Set the water heightmap uniform after initialization
      const uniforms = getUniforms<WaterVelocityUniforms>(waterVelocityVariable.material);
      uniforms.uHeightMap = { value: heightMapTexture };
      uniforms.uWaterHeightmap = {
        value: gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
      };
    },
  };
};
