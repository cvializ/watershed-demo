import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import type { OrganicDeposit } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainQuality";
import type { WaterHeightUniforms } from "@/gpu/waterFlowSimulation/variables/createGpuWaterHeight";
import type { PollutantSpeciesId } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality";

import { createTestingTexture } from "@/gpu/testingSimulation/createTestingTexture";
import { createGpuClouds } from "@/gpu/waterFlowSimulation/variables/createGpuClouds";
import { createGpuSedimentFlow } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow";
import { createGpuTerrainHeight } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainHeight";
import { createGpuTerrainQuality } from "@/gpu/waterFlowSimulation/variables/createGpuTerrainQuality";
import { createGpuWaterHeight } from "@/gpu/waterFlowSimulation/variables/createGpuWaterHeight";
import { createGpuWaterQuality } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality";
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
   * Forward the world erosion slider into sediment transport capacity.
   * @param erosionRate - Value from world.erosionRate
   */
  setSedimentErosionRate: (erosionRate: number) => void;

  /**
   * Set the angle of repose for terrain relaxation (in degrees).
   * @param angleDegrees - Angle in degrees (0-90)
   */
  setTerrainReposeAngle: (angleDegrees: number) => void;

  /**
   * Set the relaxation rate for terrain repose behavior.
   * @param rate - Fraction of over-steepened drop relocated per pass (0-1)
   */
  setTerrainRelaxRate: (rate: number) => void;

  /**
   * Registers a persistent emitter of one substance, which then releases mass every pass until
   * clearPollutantSources() runs. Unlike addWater these are not consumed by the step that used them.
   * @param x - X coordinate in world space (0 to terrainSize)
   * @param y - Y coordinate in world space (0 to terrainSize)
   * @param radius - Radius of the emitting disc in world units
   * @param amount - Mass released per pass at 60 fps
   * @param species - Substance channel, see POLLUTANT_SPECIES
   */
  addPollutantSource: (
    x: number,
    y: number,
    radius: number,
    amount: number,
    species: PollutantSpeciesId,
  ) => boolean;

  /**
   * Forgets every registered substance emitter.
   */
  clearPollutantSources: () => void;

  /**
   * Drops one load of organic matter on the ground - what an animal leaves where it stands. The deposit is a
   * declaration for the coming pass only: compute() clears it afterwards, so anything that wants to keep dropping has
   * to keep declaring (which also means a moving animal leaves pats rather than a trail behind an old emitter).
   * @param deposit - Centre and disc radius in world units (0 to terrainSize), plus mass per pass at 60 fps
   * @returns false when every deposit slot was already used for this pass
   */
  addOrganicDeposit: (deposit: OrganicDeposit) => boolean;

  /**
   * Forgets the organic deposits declared since the last pass. compute() does this itself once they have been read.
   */
  clearOrganicDeposits: () => void;

  /**
   * Get the water quality texture (four substance channels of column-integrated mass).
   */
  getPollutantTexture: () => THREE.Texture;

  /**
   * Get the terrain quality texture: the substances the ground holds - bacterial content in R and organic matter on top
   * of it in G.
   *
   * The second half of two species: both live on the land and in the water at once, so reading only the water texture
   * would hide what a catchment remembers after its puddles are gone - and everything the animals left there.
   */
  getTerrainQualityTexture: () => THREE.Texture;

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

  /**
   * Get all GPU variables for save/load operations. Everything a running world can lose its memory of belongs here:
   * save reads these render targets and destroy disposes them, so a Variable left out is state that silently does not
   * survive a load - or GPU memory that survives everything else.
   */
  getAllVariables: () => {
    heightMapVariable: Variable;
    waterHeightVariable: Variable;
    velocityVariable: Variable;
    sedimentVariable: Variable;
    cloudVariable: Variable;
    testingVariable: Variable;
    // Both substance compartments, listed together because half a bacterial census is not a saved state.
    waterQualityVariable: Variable;
    terrainQualityVariable: Variable;
  };

  /**
   * Get the renderer instance for readRenderTargetPixels.
   */
  getRenderer: () => THREE.WebGLRenderer;
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
 * @param savedTextures - Optional saved state textures for recreation (for save/load support)
 */
export type SavedSimulationTextures = {
  /**
   * Substance fields, water column and ground. saveGPUSimulationState writes both and storage.ts hands both back
   * here, and they are saved as a pair or not at all: bacteria occupy both compartments, so one without the other
   * restores half a census.
   */
  terrainQualityTexture?: THREE.DataTexture;
  waterQualityTexture?: THREE.DataTexture;
  heightMapTexture?: THREE.DataTexture;
  waterHeightTexture?: THREE.DataTexture;
  velocityTexture?: THREE.DataTexture;
  sedimentTexture?: THREE.DataTexture;
  cloudsTexture?: THREE.DataTexture;
  surfaceMaterialTexture?: THREE.DataTexture; // Terrain painting texture
};

export const createGpuWaterFlowSimulation = (
  width: number,
  terrainSize: number,
  renderer: THREE.WebGLRenderer,
  heightMapTexture: THREE.Texture,
  surfaceMaterialMap?: THREE.Texture,
  savedTextures?: SavedSimulationTextures,
): WaterFlowVisualization => {
  logger.info("[gpu:water-flow:create]");

  const gpuCompute = new GPUComputationRenderer(width, width, renderer);

  // Create variables with saved textures if provided (for save/load recreation)
  const { cloudVariable, updateClouds, getCloudTexture } = createGpuClouds(
    gpuCompute,
    width,
    savedTextures && savedTextures.cloudsTexture, // Pass saved clouds texture
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
      savedTextures && savedTextures.waterHeightTexture, // Pass saved water height texture
    );
  // Dynamic terrain height (the bed): starts from base terrain, later modified by sediment.
  // Creation order matters for dependency declaration only - never for data availability, because
  // every cross-variable read is the last committed frame (plan section 2). The bed is created
  // before the variables that must name it, then linked to sediment once both exist (A12).
  const { heightMapVariable, linkBedToSediment } = createGpuTerrainHeight(
    gpuCompute,
    width,
    heightMapTexture,
    savedTextures && savedTextures.heightMapTexture, // Pass saved height map texture
  );
  const { waterVelocityVariable, initWaterVelocity } = createGpuWaterVelocity(
    gpuCompute,
    width,
    waterHeightVariable,
    heightMapVariable, // dynamic bed via the injected dependency sampler (A11)
    surfaceMaterialMap ?? null,
    savedTextures && savedTextures.velocityTexture, // Pass saved velocity texture
  );
  const {
    sedimentFlowVariable,
    updateSedimentFlow,
    setErosionRate,
    setReposeAngle,
    setRelaxRate,
  } = createGpuSedimentFlow(
    gpuCompute,
    width,
    terrainSize / width, // world units per texel: what makes the shader's repose angle a slope, not a constant
    heightMapTexture, // static base displacement -> erodible-depth proxy (A2)
    waterVelocityVariable,
    waterHeightVariable,
    heightMapVariable,
    surfaceMaterialMap ?? null,
    savedTextures && savedTextures.sedimentTexture, // Pass saved sediment texture
  );

  // Both variables exist now, so the bed's authoritative dependency list is declared exactly once.
  linkBedToSediment(sedimentFlowVariable);

  // Substance dissolved or carried by the flow. Created after the velocity field it routes along; its own
  // dependencies are declared inside its factory (README section 1).
  const {
    waterQualityVariable,
    initWaterQuality,
    updateWaterQuality,
    linkWaterQualityToTerrain,
    addPollutantSource,
    clearPollutantSources,
  } = createGpuWaterQuality(
    gpuCompute,
    width,
    terrainSize,
    waterVelocityVariable,
    waterHeightVariable,
    savedTextures && savedTextures.waterQualityTexture,
  );

  // The ground's share of the substances that can be in the ground. Created after the water column because its
  // dependency list names it; the reverse edge is linked below once both Variables exist.
  const {
    terrainQualityVariable,
    initTerrainQuality,
    updateTerrainQuality,
    addOrganicDeposit,
    clearOrganicDeposits,
  } = createGpuTerrainQuality(
    gpuCompute,
    width,
    terrainSize, // world units per texel edge: what lets a depositor speak in animal coordinates
    waterHeightVariable,
    waterQualityVariable,
    savedTextures && savedTextures.terrainQualityTexture,
  );

  // Both halves of the bacterial exchange are on the table now, so water quality can declare its side of the
  // trade. Must happen before gpuCompute.init(), which is where dependency samplers get declared (README s1).
  linkWaterQualityToTerrain(terrainQualityVariable);

  const { testingVariable, initTesting, updateTesting } = createTestingTexture(
    gpuCompute,
    width,
  );

  const error = gpuCompute.init();
  if (error) {
    logger.error({ err: error }, "gpu compute init error");
  }

  initWaterSources();
  initWaterHeight();
  initWaterVelocity();
  initWaterQuality();
  initTerrainQuality();
  initTesting();

  // Initialize surface material map uniform
  const waterHeightUniforms = getUniforms<WaterHeightUniforms>(
    waterHeightVariable.material,
  );
  if (surfaceMaterialMap) {
    waterHeightUniforms.surfaceMaterialMap = { value: surfaceMaterialMap };
  }

  return {
    compute: (deltaTime: number, gameTime: number = 0) => {
      // Update clouds with global time reference for save/load support
      updateClouds(gameTime);

      // Update water height with global time reference for save/load support
      updateWaterHeight(gameTime);

      // Scale the sediment coefficients to this frame's elapsed time (plan S6)
      updateSedimentFlow(deltaTime);

      // ...and the same for substance transport and decay. Emitters are deliberately not cleared here: they are
      // landscape features, unlike water sources, which each step consumes.
      updateWaterQuality(deltaTime);

      // The ground compartment scales its half of the bacterial exchange by the same frame time; both shaders see
      // an identical dtScale because compute() receives one deltaTime for the whole pass.
      updateTerrainQuality(deltaTime);

      // Update testing texture with global time reference
      updateTesting(gameTime);

      // Compute all variables (velocity computation, testing)
      gpuCompute.compute();

      // Both kinds of per-pass declaration are consumed by the pass that read them. Water sources and organic
      // deposits are cleared for exactly this reason; pollutant emitters are not, because those are landscape features.
      clearWater();
      clearOrganicDeposits();
    },
    getGpuCompute: () => gpuCompute,
    addWater,
    addPollutantSource,
    clearPollutantSources,
    addOrganicDeposit,
    clearOrganicDeposits,
    getPollutantTexture: () =>
      gpuCompute.getCurrentRenderTarget(waterQualityVariable).texture,
    getTerrainQualityTexture: () =>
      gpuCompute.getCurrentRenderTarget(terrainQualityVariable).texture,
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
    setSedimentErosionRate: (erosionRate: number) => {
      // Forwarded to the transport-capacity coefficient; nothing writes world.erosionRate back
      setErosionRate(erosionRate);
    },
    setTerrainReposeAngle: (angleDegrees: number) => {
      setReposeAngle(angleDegrees);
    },
    setTerrainRelaxRate: (rate: number) => {
      setRelaxRate(rate);
    },
    getWaterHeightVariable: () => waterHeightVariable,
    getCloudVariable: () => cloudVariable,
    getHeightMapVariable: () => heightMapVariable,
    getHeightData: () => {
      // Access the terrain height texture data from heightMapVariable
      const texture = heightMapVariable.initialValueTexture;
      if (!texture) return null;
      // Access image.data which contains the texture data
      const imageData = texture.image as Float32Array | null;
      return imageData;
    },
    getDynamicHeightMapTexture: () =>
      gpuCompute.getCurrentRenderTarget(heightMapVariable).texture,
    getAllVariables: () => ({
      heightMapVariable,
      waterHeightVariable,
      velocityVariable: waterVelocityVariable,
      sedimentVariable: sedimentFlowVariable,
      cloudVariable,
      testingVariable,
      waterQualityVariable,
      terrainQualityVariable,
    }),
    getRenderer: () => renderer,
  };
};
