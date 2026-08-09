import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import type { SedimentFlowUniforms } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow";
import type { WaterHeightUniforms } from "@/gpu/waterFlowSimulation/variables/createGpuWaterHeight";

import { createTestingTexture } from "@/gpu/testingSimulation/createTestingTexture";
import { createGpuClouds } from "@/gpu/waterFlowSimulation/variables/createGpuClouds";
import { createGpuSedimentFlow } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow";
import { createGpuTerrainHeight } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainHeight";
import { createGpuWaterHeight } from "@/gpu/waterFlowSimulation/variables/createGpuWaterHeight";
import { createGpuWaterSources } from "@/gpu/waterFlowSimulation/variables/createGpuWaterSources";
import { createGpuWaterVelocity } from "@/gpu/waterFlowSimulation/variables/createGpuWaterVelocity";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

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
   * Get the sediment flow texture.
   */
  getSedimentFlowTexture: () => THREE.Texture;

  /**
   * Get the testing texture.
   */
  getTestingTexture: () => THREE.Texture;

  /**
   * Get the GPU computation variable for testing (for uniform updates).
   */
  getTestingVariable: () => Variable;

  /**
   * Get the GPU computation variable for sediment flow (for uniform updates).
   */
  getSedimentFlowVariable: () => Variable;

  /**
   * Get the dynamic height map texture (modified by sediment erosion/deposition).
   */
  getDynamicHeightMapTexture: () => THREE.Texture;

  /**
   * Get the GPU computation variable for terrain height.
   */
  getHeightMapVariable: () => Variable;

  /**
   * Get the GPU computation variable for water height (for uniform updates).
   */
  getWaterHeightVariable: () => Variable;

  /**
   * Get the GPU computation variable for clouds (for uniform updates).
   */
  getCloudVariable: () => Variable;

  /**
   * Get the GPU computation renderer instance.
   */
  getGpuCompute: () => GPUComputationRenderer;

  /**
   * Get the height data array from the terrain height variable.
   */
  getHeightData: () => Float32Array | null;

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
 * Surface material support:
 * - Surface material texture is passed to water simulation for material-based flow effects
 * - Different materials affect infiltration rate and friction coefficient
 * - Water flows differently on grass (slower, more absorption) vs rocks (faster, less absorption)
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
 * @param surfaceMaterialMap - Texture containing surface material information (optional)
 */
export const createGpuWaterFlowSimulation = (
  width: number,
  terrainSize: number,
  renderer: THREE.WebGLRenderer,
  heightMapTexture: THREE.Texture,
  surfaceMaterialMap?: THREE.Texture,
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
      surfaceMaterialMap ?? null,
    );
  const { waterVelocityVariable, initWaterVelocity } = createGpuWaterVelocity(
    gpuCompute,
    width,
    heightMapTexture,
    waterHeightVariable,
    surfaceMaterialMap ?? null,
  );
  const { sedimentFlowVariable, initSedimentFlow } = createGpuSedimentFlow(
    gpuCompute,
    width,
    heightMapTexture,
    waterVelocityVariable,
  );

  // Dynamic terrain height: starts from base terrain, modified by sediment erosion/deposition
  const { heightMapVariable } = createGpuTerrainHeight(
    gpuCompute,
    width,
    heightMapTexture,
    sedimentFlowVariable,
  );

  // Update sediment flow dependencies to include dynamic height map
  gpuCompute.setVariableDependencies(sedimentFlowVariable, [
    waterVelocityVariable,
    sedimentFlowVariable,
    heightMapVariable,
  ]);

  // Sediment flow uniform to use dynamic height map - set after init
  const { testingVariable, initTesting, updateTesting } = createTestingTexture(
    gpuCompute,
    width,
  );

  const error = gpuCompute.init();
  if (error) {
    logger.error({ err: error }, "gpu compute init error");
  }

  // Update sediment flow uniform to use dynamic height map after init
  const sedimentUniforms = getUniforms<SedimentFlowUniforms>(
    sedimentFlowVariable.material,
  );
  sedimentUniforms.uHeightMap = {
    value: gpuCompute.getCurrentRenderTarget(heightMapVariable).texture,
  };

  initWaterSources();
  initWaterHeight();
  initWaterVelocity();
  initSedimentFlow();
  initTesting();

  // Initialize surface material map uniform
  const waterHeightUniforms = getUniforms<WaterHeightUniforms>(
    waterHeightVariable.material,
  );
  if (surfaceMaterialMap) {
    waterHeightUniforms.surfaceMaterialMap = { value: surfaceMaterialMap };
  }

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
    getGpuCompute: () => gpuCompute,
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
    getSedimentFlowTexture: () =>
      gpuCompute.getCurrentRenderTarget(sedimentFlowVariable).texture,
    getSurfaceMaterialTexture: (): THREE.Texture => {
      // Placeholder - returns empty texture as surface materials are not yet implemented
      return new THREE.Texture();
    },
    // Testing Simulation mode visualizes the sediment flow texture
    getTestingTexture: () =>
      gpuCompute.getCurrentRenderTarget(sedimentFlowVariable).texture,
    getTestingVariable: () => testingVariable,
    getSedimentFlowVariable: () => sedimentFlowVariable,
    getWaterHeightVariable: () => waterHeightVariable,
    getCloudVariable: () => cloudVariable,
    getHeightMapVariable: () => heightMapVariable,
  getHeightData: () => {
    // Access the terrain height texture data from heightMapVariable
    const texture = heightMapVariable.initialValueTexture;
    if (!texture) return null;
    // Access image.data which contains the texture data
    return (texture as any).image?.data as Float32Array | null;
  },
    getDynamicHeightMapTexture: () =>
      gpuCompute.getCurrentRenderTarget(heightMapVariable).texture,
  };
};
