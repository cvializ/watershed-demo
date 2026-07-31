import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import { createTestingTexture } from "@/gpu/testingSimulation/createTestingTexture";
import { createGpuClouds } from "@/gpu/waterFlowSimulation/variables/createGpuClouds";
import { createGpuWaterHeight } from "@/gpu/waterFlowSimulation/variables/createGpuWaterHeight";
import { createGpuWaterSources } from "@/gpu/waterFlowSimulation/variables/createGpuWaterSources";
import { createGpuWaterVelocity } from "@/gpu/waterFlowSimulation/variables/createGpuWaterVelocity";
import { logger } from "@/utils/logger";

export type WaterFlowVisualization = {
  /**
   * Executes one step of the water flow simulation.
   * @param deltaTime - Time elapsed since last frame
   * @param gameTime - Total game time for testing effects
   */
  compute: (deltaTime: number, gameTime?: number) => void;

  /**
   * Adds water at a specific location on the terrain.
   * @param x - X coordinate in world space (0 to terrainSize)
   * @param y - Y coordinate in world space (0 to terrainSize)
   * @param amount - Amount of water to add
   * @param radius - Radius of the water circle in world units
   */
  addWater: (x: number, y: number, amount: number, radius: number) => void;

  /**
   * Get the cloud shadow texture for use with terrain materials.
   */
  getCloudShadowTexture: () => THREE.Texture;

  /**
   * Get the velocity texture for visualization.
   */
  getVelocityTexture: () => THREE.Texture;

  /**
   * Get the velocity texture for the full simulation.
   */
  getSimulationTexture: () => THREE.Texture;

  /**
   * Get the surface material texture.
   */
  getSurfaceMaterialTexture: () => THREE.Texture;

  /**
   * Get the testing texture.
   */
  getTestingTexture: () => THREE.Texture;

  /**
   * Get the GPU computation variable for testing (for uniform updates).
   */
  getTestingVariable: () => Variable;

  /**
   * Get the GPU computation variable for water height (for uniform updates).
   */
  getWaterHeightVariable: () => Variable;

  /**
   * Get the GPU computation variable for clouds (for uniform updates).
   */
  getCloudVariable: () => Variable;

  setSunPosition: (position: THREE.Vector3) => void;
};

/**
 * Creates a GPU-based D8 water surface flow simulation on terrain.
 *
 * The D8 algorithm is a widely used method for river network generation in GIS.
 * It assigns each cell a flow direction to its single downslope neighbor among 8 neighbors
 * (4 cardinal + 4 diagonal), making it more realistic than the simpler 4-direction (von Neumann) approach.
 *
 * Simulation principles:
 * 1. **D8 Flow Direction**: Each cell flows entirely to its single downslope neighbor
 * 2. **Gradient Calculation**: Water flows in the direction of steepest descent
 * 3. **Advection**: Water transfers from higher to lower cells based on slope
 * 4. **Conservation**: Inflow equals outflow (plus any infiltration/evaporation)
 *
 * Cloud shadow separation:
 * - Cloud shadow computation is separated into its own GPU computation variable
 * - The water simulation samples cloud shadow intensity from a pre-computed texture
 * - This allows clean separation of concerns and potential reuse of cloud shadows
 *
 * Water sources approach:
 * - Water source computation is separated into its own GPU computation variable
 * - The water simulation samples water sources from a pre-computed texture
 * - This allows multiple water sources to be efficiently added and combined on GPU
 *
 * Key differences from 4-direction simulation:
 * - Considers diagonal neighbors (8 total instead of 4)
 * - More realistic flow patterns that can curve
 * - Better representation of natural watershed divides
 *
 * @param width - Width of the simulation grid (height will be same for square grid)
 * @param terrainSize - Physical size of the terrain in world units
 * @param renderer - WebGLRenderer instance
 * @param heightMapTexture - Texture containing terrain height data
 */
export const createGpuWaterFlowSimulation = (
  width: number,
  terrainSize: number,
  renderer: THREE.WebGLRenderer,
  heightMapTexture: THREE.Texture,
): WaterFlowVisualization => {
  logger.info("[gpu:water-flow:create]");

  const gpuCompute = new GPUComputationRenderer(width, width, renderer);

  const { cloudVariable, updateClouds, getCloudTexture } = createGpuClouds(
    gpuCompute,
    width,
  );

  const { waterSourcesVariable, initWaterSources, addWater, clearWater } =
    createGpuWaterSources(gpuCompute, width, heightMapTexture, terrainSize);
  const { waterHeightVariable, initWaterHeight, updateWaterHeight } =
    createGpuWaterHeight(
      gpuCompute,
      width,
      heightMapTexture,
      cloudVariable,
      waterSourcesVariable,
    );
  const { waterVelocityVariable, initWaterVelocity } = createGpuWaterVelocity(
    gpuCompute,
    width,
    heightMapTexture,
    waterHeightVariable,
  );
  const { testingVariable, initTesting, updateTesting } = createTestingTexture(
    gpuCompute,
    width,
  )

  const error = gpuCompute.init();
  if (error) {
    logger.error({ err: error }, "gpu compute init error");
  }

  initWaterSources();
  initWaterHeight();
  initWaterVelocity();
  initTesting();

  return {
    compute: (_deltaTime: number, gameTime: number = 0) => {
      // Update clouds with global time reference for save/load support
      updateClouds(gameTime);

      // Update water height with global time reference for save/load support
      updateWaterHeight(gameTime);

      // Update testing texture with global time reference
      updateTesting(gameTime);

      // Compute all variables (velocity computation, testing)
      gpuCompute.compute();

      clearWater();
    },
    addWater,
    setSunPosition: (position: THREE.Vector3) => {
      waterHeightVariable.material.uniforms.uLightPosition = {
        value: position.clone(),
      };
    },
    getCloudShadowTexture: () => getCloudTexture(),
    getSimulationTexture: () =>
      gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
    getVelocityTexture: () =>
      gpuCompute.getCurrentRenderTarget(waterVelocityVariable).texture,
    getSurfaceMaterialTexture: (): THREE.Texture => {
      // Placeholder - returns empty texture as surface materials are not yet implemented
      return new THREE.Texture();
    },
    getTestingTexture: () =>
      gpuCompute.getCurrentRenderTarget(testingVariable).texture,
    getTestingVariable: () => testingVariable,
    getWaterHeightVariable: () => waterHeightVariable,
    getCloudVariable: () => cloudVariable,
  };
};
