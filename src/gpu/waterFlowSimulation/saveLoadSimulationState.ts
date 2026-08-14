import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";
import * as THREE from "three";
import { logger } from "@/utils/logger";

/**
 * Interface for GPU simulation state that can be saved/restored
 */
export interface GPUSimulationState {
  heightMapData: Float32Array | null;
  width: number;
  height: number;
}

/**
 * Save GPU simulation height map data from BOTH ping-pong render targets
 */
export const saveGPUSimulationState = (
  heightMapVariable: Variable,
  gpuCompute: any, // GPUComputationRenderer
  renderer: THREE.WebGLRenderer,
): GPUSimulationState | null => {
  const initialTexture = heightMapVariable.initialValueTexture;
  if (!initialTexture) {
    logger.warn("[gpu:save] Initial value texture not available");
    return null;
  }
  
  const initialImageData = initialTexture.image as { width: number; height: number } | null;
  if (!initialImageData) {
    logger.warn("[gpu:save] Initial texture image not available");
    return null;
  }
  
  const width = initialImageData.width || 512;
  const height = initialImageData.height || 512;

  // Read from current render target
  const currentRenderTarget = gpuCompute.getCurrentRenderTarget(heightMapVariable);
  const pixelData = new Float32Array(width * height * 4);

  renderer.readRenderTargetPixels(
    currentRenderTarget,
    0,
    0,
    width,
    height,
    pixelData,
  );

  logger.info(
    { width, height, dataSize: pixelData.length },
    "[gpu:save] Saved GPU simulation height map state",
  );

  return {
    heightMapData: pixelData,
    width,
    height,
  };
};

/**
 * Restore GPU simulation height map data to BOTH ping-pong render targets
 */
export const restoreGPUSimulationState = (
  heightMapVariable: Variable,
  state: GPUSimulationState,
): boolean => {
  const initialTexture = heightMapVariable.initialValueTexture;
  if (!initialTexture) {
    logger.warn("[gpu:restore] Initial value texture not available");
    return false;
  }
  
  const initialImageData = initialTexture.image as { width: number; height: number } | null;
  if (!initialImageData) {
    logger.warn("[gpu:restore] Initial texture image not available");
    return false;
  }
  
  const width = initialImageData.width || 512;
  const height = initialImageData.height || 512;

  // Verify data length matches (RGBA format = width * height * 4)
  const expectedLength = width * height * 4;
  if (!state.heightMapData || state.heightMapData.length !== expectedLength) {
    logger.warn(
      {
        savedLength: state.heightMapData?.length,
        requiredLength: expectedLength,
      },
      "[gpu:restore] Height map data length mismatch",
    );
    return false;
  }

  // Restore to BOTH render targets (ping-pong buffers)
  const renderTargets = heightMapVariable.renderTargets as THREE.WebGLRenderTarget[];

  if (!renderTargets || renderTargets.length !== 2) {
    logger.error(
      { hasRenderTargets: !!renderTargets, count: renderTargets?.length },
      "[gpu:restore] Variable does not have expected render targets",
    );
    return false;
  }

  // Restore data to both render targets
  for (let i = 0; i < 2; i++) {
    const renderTarget = renderTargets[i];
    const texture = renderTarget.texture;

    if (!texture) {
      logger.warn(`[gpu:restore] Render target ${i} texture not available`);
      continue;
    }

    const imageData = texture.image as { data: Float32Array };
    if (!imageData.data) {
      logger.warn(`[gpu:restore] Render target ${i} image data not available`);
      continue;
    }

    // Copy the saved data to this render target's texture
    imageData.data.set(state.heightMapData);
    texture.needsUpdate = true;

    logger.info(
      { renderTargetIndex: i, dataSize: imageData.data.length },
      `[gpu:restore] Restored render target ${i}`,
    );
  }

  // Also restore the initialValueTexture for consistency
  if (initialImageData) {
    const initialImageDataFull = initialTexture.image as { data: Float32Array };
    if (initialImageDataFull.data) {
      initialImageDataFull.data.set(state.heightMapData);
      initialTexture.needsUpdate = true;
    }
  }

  logger.info(
    "[gpu:restore] Successfully restored GPU simulation state to all render targets",
  );

  return true;
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