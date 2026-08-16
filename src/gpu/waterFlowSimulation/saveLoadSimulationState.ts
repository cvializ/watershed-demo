import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";
import * as THREE from "three";
import { logger } from "@/utils/logger";

/**
 * Interface for GPU simulation state that can be saved/restored
 */
export interface GPUSimulationState {
  heightMapData: Float32Array | null;
  waterHeightData: Float32Array | null;
  velocityData: Float32Array | null;
  sedimentData: Float32Array | null;
  cloudsData: Float32Array | null;
  surfaceMaterialData: Float32Array | null; // Terrain painting texture data
  width: number;
  height: number;
  gameTime?: number; // Saved game time for proper resume
}

/**
 * Save ALL GPU simulation state from render targets
 * @param variables - Object containing all GPU computation variables
 * @param gpuCompute - GPUComputationRenderer instance
 * @param renderer - WebGLRenderer instance
 * @param gameTime - Current game time (optional, for proper resume)
 * @param surfaceMaterialTexture - Optional surface material texture to save
 */
export const saveGPUSimulationState = (
  variables: {
    heightMapVariable: Variable;
    waterHeightVariable: Variable;
    velocityVariable: Variable;
    sedimentVariable: Variable;
    cloudVariable: Variable;
  },
  gpuCompute: any, // GPUComputationRenderer
  renderer: THREE.WebGLRenderer,
  gameTime?: number,
  surfaceMaterialTexture?: THREE.Texture | null,
): GPUSimulationState | null => {
  const { heightMapVariable, waterHeightVariable, velocityVariable, sedimentVariable, cloudVariable } = variables;

  // Read from current render targets
  const heightRenderTarget = gpuCompute.getCurrentRenderTarget(heightMapVariable);
  const waterHeightRenderTarget = gpuCompute.getCurrentRenderTarget(waterHeightVariable);
  const velocityRenderTarget = gpuCompute.getCurrentRenderTarget(velocityVariable);
  const sedimentRenderTarget = gpuCompute.getCurrentRenderTarget(sedimentVariable);
  const cloudRenderTarget = gpuCompute.getCurrentRenderTarget(cloudVariable);

  const width = heightRenderTarget.texture.image.width || 512;
  const height = heightRenderTarget.texture.image.height || 512;
  const size = width * height * 4; // RGBA format

  const heightMapData = new Float32Array(size);
  const waterHeightData = new Float32Array(size);
  const velocityData = new Float32Array(size);
  const sedimentData = new Float32Array(size);
  const cloudsData = new Float32Array(size);

  // Read all render targets
  renderer.readRenderTargetPixels(heightRenderTarget, 0, 0, width, height, heightMapData);
  renderer.readRenderTargetPixels(waterHeightRenderTarget, 0, 0, width, height, waterHeightData);
  renderer.readRenderTargetPixels(velocityRenderTarget, 0, 0, width, height, velocityData);
  renderer.readRenderTargetPixels(sedimentRenderTarget, 0, 0, width, height, sedimentData);
  renderer.readRenderTargetPixels(cloudRenderTarget, 0, 0, width, height, cloudsData);

  // Read surface material texture if provided
  let surfaceMaterialData: Float32Array | null = null;
  if (surfaceMaterialTexture) {
    const size = width * height * 4;
    
    // Read the surface material texture directly from its data array if available
    const textureAsDataTexture = surfaceMaterialTexture as THREE.DataTexture;
    const textureData = textureAsDataTexture.image && 'data' in textureAsDataTexture.image
      ? (textureAsDataTexture.image.data as Float32Array | undefined)
      : undefined;
    if (textureData && textureData instanceof Float32Array) {
      // Copy directly from the texture's data array
      surfaceMaterialData = new Float32Array(textureData.slice(0, size));
    }
  }

  logger.info(
    { width, height, dataSize: size },
    "[gpu:save] Saved ALL GPU simulation state",
  );

  return {
    heightMapData,
    waterHeightData,
    velocityData,
    sedimentData,
    cloudsData,
    surfaceMaterialData,
    width,
    height,
    gameTime,
  };
};

/**
 * Create initial textures from saved state for recreation
 */
export const createTexturesFromState = (
  state: GPUSimulationState,
): {
  heightMapTexture: THREE.DataTexture;
  waterHeightTexture: THREE.DataTexture;
  velocityTexture: THREE.DataTexture;
  sedimentTexture: THREE.DataTexture;
  cloudsTexture: THREE.DataTexture;
  surfaceMaterialTexture: THREE.DataTexture; // Terrain painting texture
} => {
  const { width, height } = state;

  const createTexture = (data: Float32Array | null) => {
    const textureData = data || new Float32Array(width * height * 4);
    const texture = new THREE.DataTexture(
      textureData,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    return texture;
  };

  return {
    heightMapTexture: createTexture(state.heightMapData),
    waterHeightTexture: createTexture(state.waterHeightData),
    velocityTexture: createTexture(state.velocityData),
    sedimentTexture: createTexture(state.sedimentData),
    cloudsTexture: createTexture(state.cloudsData),
    surfaceMaterialTexture: createTexture(state.surfaceMaterialData), // Terrain painting texture
  };
};

/**
 * Destroy all GPU computation variables and render targets
 * This is necessary before recreating the simulation with restored state
 */
export const destroyGpuSimulation = (
  variables: {
    heightMapVariable: Variable;
    waterHeightVariable: Variable;
    velocityVariable: Variable;
    sedimentVariable: Variable;
    cloudVariable: Variable;
    testingVariable?: Variable;
  },
): void => {
  const allVariables = [
    variables.heightMapVariable,
    variables.waterHeightVariable,
    variables.velocityVariable,
    variables.sedimentVariable,
    variables.cloudVariable,
  ];

  if (variables.testingVariable) {
    allVariables.push(variables.testingVariable);
  }

  for (const variable of allVariables) {
    // Dispose of render targets to free GPU memory
    if (variable.renderTargets) {
      for (const renderTarget of variable.renderTargets) {
        if (renderTarget && renderTarget.dispose) {
          renderTarget.dispose();
        }
      }
    }

    // Dispose of the texture if it exists
    if (variable.initialValueTexture) {
      variable.initialValueTexture.dispose();
    }

    // Dispose of material if it exists
    if (variable.material) {
      variable.material.dispose();
    }
  }

  logger.info("[gpu:destroy] Destroyed all GPU simulation variables and render targets");
};

/**
 * Get current GPU height map data from render target for debugging/verification
 */
export const getGPUHeightMapData = (
  heightMapVariable: Variable,
  gpuCompute: any, // GPUComputationRenderer
  renderer: THREE.WebGLRenderer,
): Float32Array | null => {
  const renderTarget = gpuCompute.getCurrentRenderTarget(heightMapVariable);
  const texture = renderTarget.texture;

  if (!texture) {
    return null;
  }

  const width = texture.image.width || 512;
  const height = texture.image.height || 512;

  // Read the actual pixel data from the render target
  const pixelData = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(
    renderTarget,
    0,
    0,
    width,
    height,
    pixelData,
  );

  return pixelData;
};