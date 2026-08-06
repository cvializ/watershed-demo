import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import waterVelocityFragmentShader from "@/shaders/compute/water-velocity.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export type WaterVelocityUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uWaterHeightmap: THREE.IUniform<THREE.Texture | null>;
  surfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
};

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

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;

  return { texture, data };
};

export const createGpuWaterVelocity = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  heightMapTexture: THREE.Texture,
  waterHeightVariable: Variable,
  surfaceMaterialMap?: THREE.Texture | null,
  heightMapVariable?: Variable,
) => {
  logger.info("[gpu:water-velocity:create]");

  const { texture: velocityTexture } = createInitialVelocityTexture(width);
  const waterVelocityVariable = gpuCompute.addVariable(
    "waterVelocity",
    waterVelocityFragmentShader,
    velocityTexture,
  );

  const dependencies = [waterHeightVariable];
  if (heightMapVariable) {
    // Water velocity depends on dynamic height map (modified by erosion)
    dependencies.push(heightMapVariable);
  }
  gpuCompute.setVariableDependencies(waterVelocityVariable, dependencies);

  return {
    waterVelocityVariable,
    initWaterVelocity: () => {
      // Set the water heightmap uniform after initialization
      const uniforms = getUniforms<WaterVelocityUniforms>(
        waterVelocityVariable.material,
      );
      // Use dynamic height map if available (modified by erosion), otherwise use base height map
      uniforms.uHeightMap = {
        value: heightMapVariable
          ? gpuCompute.getCurrentRenderTarget(heightMapVariable).texture
          : heightMapTexture,
      };
      uniforms.uWaterHeightmap = {
        value: gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
      };
      // Set surface material map for friction calculations in the velocity shader
      if (surfaceMaterialMap) {
        uniforms.surfaceMaterialMap = { value: surfaceMaterialMap };
      } else {
        uniforms.surfaceMaterialMap = { value: null };
      }
    },
  };
};
