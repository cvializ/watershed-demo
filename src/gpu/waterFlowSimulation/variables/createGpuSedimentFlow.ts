import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import sedimentFlowFragmentShader from "@/shaders/compute/sediment-flow.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export type SedimentFlowUniforms = {
  uVelocityMap: THREE.IUniform<THREE.Texture>;
  uHeightMap: THREE.IUniform<THREE.Texture>;
  surfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  uHasSurfaceMaterialMap: THREE.IUniform<number>;
  baseErosionRate: THREE.IUniform<number>;
};

/**
 * Creates an initial sediment flow texture with zero values for all cells.
 */
const createInitialSedimentFlowTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA

  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 0.0; // R: sediment flow direction X
    data[i * 4 + 1] = 0.0; // G: sediment flow direction Y
    data[i * 4 + 2] = 0.0; // B: sediment amount
    data[i * 4 + 3] = 0.0; // A: erosion/deposition rate
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

export const createGpuSedimentFlow = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  heightMapTexture: THREE.Texture,
  waterVelocityVariable: Variable,
  heightMapVariable?: Variable,
  surfaceMaterialMap?: THREE.Texture | null,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:sediment-flow:create]");

  // Use saved texture if provided, otherwise create initial texture
  const sedimentFlowTexture = savedTexture || createInitialSedimentFlowTexture(width).texture;
  const sedimentFlowVariable = gpuCompute.addVariable(
    "sedimentFlow",
    sedimentFlowFragmentShader,
    sedimentFlowTexture,
  );

  const dependencies = [waterVelocityVariable, sedimentFlowVariable];
  if (heightMapVariable) {
    // Sediment flow depends on dynamic height map for erosion calculations
    dependencies.push(heightMapVariable);
  }
  gpuCompute.setVariableDependencies(sedimentFlowVariable, dependencies);

  return {
    sedimentFlowVariable,
    initSedimentFlow: () => {
      const uniforms = getUniforms<SedimentFlowUniforms>(
        sedimentFlowVariable.material,
      );
      uniforms.uVelocityMap = {
        value: gpuCompute.getCurrentRenderTarget(waterVelocityVariable).texture,
      };
      // Use dynamic height map if available (modified by erosion), otherwise use base height map
      uniforms.uHeightMap = {
        value: heightMapVariable
          ? gpuCompute.getCurrentRenderTarget(heightMapVariable).texture
          : heightMapTexture,
      };
      // Pass surface material map for material-dependent erosion rates
      uniforms.surfaceMaterialMap = {
        value: surfaceMaterialMap ?? null,
      };
      // Flag indicating if surface material map is available
      uniforms.uHasSurfaceMaterialMap = {
        value: surfaceMaterialMap ? 1.0 : 0.0,
      };
      // Base erosion rate (multiplied by material-specific factors)
      uniforms.baseErosionRate = { value: 0.01 };
    },
    getSedimentFlowUniforms: () => {
      return getUniforms<SedimentFlowUniforms>(sedimentFlowVariable.material);
    },
  };
};
