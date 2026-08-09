import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import terrainHeightFragmentShader from "@/shaders/compute/terrain-height.frag?raw";
import { logger } from "@/utils/logger";

// CPU-side height data that mirrors GPU simulation
let cpuHeightData: Float32Array | null = null;

/**
 * Get the CPU height data (for mesh updates)
 */
export const getCpuHeightData = (): Float32Array | null => cpuHeightData;

/**
 * Update CPU height data from GPU render target
 */
export const updateCpuHeightFromRenderTarget = (
  renderTarget: THREE.WebGLRenderTarget,
  width: number,
) => {
  if (!cpuHeightData) return;

  const pixelData = new Uint8Array(width * width * 4);

  try {
    // Read as uint8 (0-255) and convert to float (0-1)
    // Note: This requires the render target to be readable
    const renderer = (renderTarget as any).renderer;
    if (!renderer) {
      logger.warn("[gpu:terrain-height] No renderer available for reading");
      return;
    }

    // Try to read as float first, fall back to uint8
    const floatData = new Float32Array(width * width * 4);
    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      width,
      width,
      floatData as any,
    );

    // Copy R channel to CPU data
    for (let i = 0; i < width * width; i++) {
      cpuHeightData[i] = floatData[i * 4];
    }

    logger.debug("[gpu:terrain-height] Updated CPU height from render target");
  } catch (error) {
    logger.warn("[gpu:terrain-height] Failed to read render target:", error);
  }
};

/**
 * Creates an initial terrain height texture by copying the base terrain heights.
 */
const createInitialTerrainHeightTexture = (
  size: number,
  baseHeightMapTexture: THREE.Texture,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA

  // If base height map is a DataTexture, copy its data
  if (baseHeightMapTexture instanceof THREE.DataTexture) {
    const sourceData = baseHeightMapTexture.image.data as Float32Array;
    for (let i = 0; i < size * size; i++) {
      const heightValue = sourceData[i];
      data[i * 4 + 0] = heightValue; // R: terrain height
      data[i * 4 + 1] = 0.0; // G: unused
      data[i * 4 + 2] = 0.0; // B: unused
      data[i * 4 + 3] = 1.0; // A: alpha
    }
  } else {
    // Initialize to zero if source is not a DataTexture
    for (let i = 0; i < size * size; i++) {
      data[i * 4 + 0] = 0.0;
      data[i * 4 + 1] = 0.0;
      data[i * 4 + 2] = 0.0;
      data[i * 4 + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;

  // Store CPU data for mesh updates
  cpuHeightData = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    cpuHeightData[i] = data[i * 4]; // R channel
  }

  return { texture, data };
};

const createGpuTerrainHeight = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  baseHeightMapTexture: THREE.Texture,
  sedimentFlowVariable: Variable,
) => {
  logger.info("[gpu:terrain-height:create]");

  const { texture: terrainHeightTexture } = createInitialTerrainHeightTexture(
    width,
    baseHeightMapTexture,
  );

  const heightMapVariable = gpuCompute.addVariable(
    "heightMap",
    terrainHeightFragmentShader,
    terrainHeightTexture,
  );

  // Terrain height depends on itself (feedback) and sediment flow (erosion source)
  gpuCompute.setVariableDependencies(heightMapVariable, [
    sedimentFlowVariable,
    heightMapVariable,
  ]);

  return {
    heightMapVariable,
  };
};

export { createGpuTerrainHeight };