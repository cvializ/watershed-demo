import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import terrainHeightFragmentShader from "@/shaders/compute/terrain-height.frag?raw";
import { logger } from "@/utils/logger";

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
  texture.flipY = true; // Match GPUComputationRenderer coordinate system
  texture.needsUpdate = true;

  return { texture, data };
};

const createGpuTerrainHeight = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  baseHeightMapTexture: THREE.Texture,
  sedimentFlowVariable: Variable,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:terrain-height:create]");

  // Use saved texture if provided, otherwise create initial texture from base height map
  const terrainHeightTexture =
    savedTexture ||
    createInitialTerrainHeightTexture(width, baseHeightMapTexture).texture;

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
