import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import waterVelocityFragmentShader from "@/shaders/compute/water-velocity.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export type WaterVelocityUniforms = {
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

/**
 * Creates the water velocity computation.
 *
 * Terrain comes from the *dynamic* bed through the injected `heightMap` dependency sampler (plan
 * S3/A11): sediment routes along this single velocity field, so if velocity were computed from the
 * static base terrain while erosion carved the dynamic bed, export and import predicates would
 * disagree about where water goes. The pinned `uWaterHeightmap` custom uniform stays as-is for now
 * (plan section 7 records it for a separate pass).
 */
export const createGpuWaterVelocity = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  waterHeightVariable: Variable,
  heightMapVariable: Variable,
  surfaceMaterialMap?: THREE.Texture | null,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:water-velocity:create]");

  // Use saved texture if provided, otherwise create initial texture
  const velocityTexture =
    savedTexture || createInitialVelocityTexture(width).texture;
  const waterVelocityVariable = gpuCompute.addVariable(
    "waterVelocity",
    waterVelocityFragmentShader,
    velocityTexture,
  );

  gpuCompute.setVariableDependencies(waterVelocityVariable, [
    waterHeightVariable,
    heightMapVariable, // dynamic bed: flow follows the incised surface, not the base terrain
  ]);

  return {
    waterVelocityVariable,
    initWaterVelocity: () => {
      // Set the water heightmap uniform after initialization
      const uniforms = getUniforms<WaterVelocityUniforms>(
        waterVelocityVariable.material,
      );
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
