/* @knip-ignore */
// D8 water surface flow simulation with cloud shadow support
import * as THREE from "three";
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import { createGpuClouds } from "@/gpu/variables/createGpuClouds";
import { createGpuWaterHeight } from "@/gpu/variables/createGpuWaterHeight";
import { createGpuWaterSources } from "@/gpu/variables/createGpuWaterSources";
import waterVelocityFragmentShader from "@/shaders/compute/water-velocity.frag?raw";

export type WaterFlowVisualization = {
  /**
   * Executes one step of the water flow simulation.
   * @param cloudUniforms - Optional array of cloud data for shadow deposition
   * @param cloudCount - Number of active clouds (up to 16)
   */
  compute: (deltaTime: number) => void;

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
  const gpuCompute = new GPUComputationRenderer(width, width, renderer);

  const { cloudVariable, updateClouds, getCloudTexture } = createGpuClouds(gpuCompute, width);

  const { waterSourcesVariable, addWater, clearWater } = createGpuWaterSources(
    gpuCompute,
    width,
    heightMapTexture,
    terrainSize,
  );
  const { waterHeightVariable, updateWaterHeight } = createGpuWaterHeight(
    gpuCompute,
    width,
    heightMapTexture,
    cloudVariable,
    waterSourcesVariable,
  );

  // Create velocity texture with initial zero values
  const data = new Float32Array(width * width * 4);
  for (let i = 0; i < width * width; i++) {
    data[i * 4 + 0] = 0.0; // vx
    data[i * 4 + 1] = 0.0; // vy
    data[i * 4 + 2] = 0.0; // magnitude (blue channel for debugging)
    data[i * 4 + 3] = 1.0; // alpha
  }

  const velocityTexture = new THREE.DataTexture(
    data,
    width,
    width,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  velocityTexture.needsUpdate = true;

  const waterVelocityVariable = gpuCompute.addVariable(
    "waterVelocity",
    waterVelocityFragmentShader,
    velocityTexture,
  );

  gpuCompute.setVariableDependencies(waterVelocityVariable, [waterHeightVariable]);

  // Set uniforms for velocity computation
  waterVelocityVariable.material.uniforms.uHeightMap = { value: heightMapTexture };
  waterVelocityVariable.material.uniforms.uWaterHeightmap = { value: null };

  const error = gpuCompute.init();
  if (error !== null) {
    console.error("D8 GPU computation initialization error:", error);
  }

  return {
    compute: (deltaTime: number) => {
      updateClouds(deltaTime);

      // Update water height uniforms before computing
      updateWaterHeight();

      // Update water heightmap uniform for velocity computation
      waterVelocityVariable.material.uniforms.uWaterHeightmap.value =
        gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture;

      // Compute all variables (velocity computation)
      gpuCompute.compute();

      clearWater();
    },
    addWater,
    setSunPosition: (_position: THREE.Vector3) => {
      // console.log("we are coping");
      // if (waterHeightVariable.material.uniforms.uLightPosition) {
      //   waterHeightVariable.material.
      // }
    },
    getCloudShadowTexture: () => getCloudTexture(),
    getSimulationTexture: () => gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
    getVelocityTexture: () => gpuCompute.getCurrentRenderTarget(waterVelocityVariable).texture,
  };
};
