import type { GPUComputationRenderer, Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import waterHeightFragmentShader from "@/shaders/compute/water-height.frag?raw";

/**
 * Creates the fragment shader for D8 water surface flow simulation.
 *
 * The D8 algorithm considers all 8 neighbors (cardinal + diagonal) to determine
 * the direction of steepest descent. Each cell flows entirely to its single downslope neighbor.
 *
 * Cloud shadow support: Cloud shadow intensity is pre-computed in a separate GPU computation
 * variable and passed as a texture uniform. Water deposition is calculated by sampling this texture.
 *
 * Water sources support: Water source points are pre-computed in a separate GPU computation
 * variable and passed as a texture uniform. Water is added at source locations from this texture.
 *
 * Key D8 principles:
 * 1. Calculate total height (terrain + water) for center and all 8 neighbors
 * 2. Find the neighbor with lowest total height (downslope direction)
 * 3. Calculate slope as difference between center and downslope neighbor
 * 4. Outflow is proportional to water height and slope
 * 5. Inflow is calculated by checking which neighbors flow TO this cell
 *
 * Cloud shadow feature:
 * 6. Cloud shadow texture sampled per-pixel for deposition calculation
 * 7. Water is added proportional to cloud shadow intensity from pre-computed texture
 *
 * Water sources feature:
 * 8. Water sources texture sampled per-pixel for additional water input
 * 9. Multiple water sources can be efficiently added and combined on GPU
 */

/**
 * Creates an initial water texture with no initial water covering the entire terrain.
 */
const createInitialWaterTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA
  const initialWaterHeight = 0.0;

  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = initialWaterHeight; // R: water height (uniform across all texels)
    data[i * 4 + 1] = 0.0; // G: unused
    data[i * 4 + 2] = 0.0; // B: unused
    data[i * 4 + 3] = 1.0; // A: alpha
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  console.log("Initial D8 water texture created:", {
    size,
    firstValue: data[0],
    lastValue: data[data.length - 4],
  });
  return { texture, data };
};

export const createGpuWaterHeight = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  heightMapTexture: THREE.Texture,
  cloudShadowVariable: Variable,
  waterSourcesVariable: Variable,
) => {
  const { texture: waterTexture } = createInitialWaterTexture(width);
  const waterHeightVariable = gpuCompute.addVariable(
    "waterHeight",
    waterHeightFragmentShader,
    waterTexture,
  );
  gpuCompute.setVariableDependencies(waterHeightVariable, [
    cloudShadowVariable,
    waterSourcesVariable,
    waterHeightVariable,
  ]);
  waterHeightVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
  waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.5 }; // Default: moderate flow speed
  waterHeightVariable.material.uniforms.drainageRate = { value: 0.01 }; // Default: slow drainage
  waterHeightVariable.material.uniforms.waterSourcesMap = { value: null };
  waterHeightVariable.material.uniforms.cloudShadowMap = { value: null };

  return {
    waterHeightVariable,
    updateWaterHeight: () => {
      // Update uniforms with the results of the computation
      waterHeightVariable.material.uniforms.cloudShadowMap.value =
        gpuCompute.getCurrentRenderTarget(cloudShadowVariable).texture;
      waterHeightVariable.material.uniforms.waterSourcesMap.value =
        gpuCompute.getCurrentRenderTarget(waterSourcesVariable).texture;
    },
  };
};
