import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import driftingCloudFragmentShader from "@/shaders/compute/drifting-cloud.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * Uniform structure for drifting cloud computation shader.
 */
type DriftingCloudUniforms = {
  uTime: THREE.IUniform<number>;
  uDriftSpeed: THREE.IUniform<THREE.Vector2>;
  uWindSetTime: THREE.IUniform<number>;
  uAccumulatedDrift: THREE.IUniform<THREE.Vector2>;
  uSpeed: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  uDensity: THREE.IUniform<number>;
};

export type GpuClouds = {
  cloudVariable: Variable;
  updateClouds: (gameTime: number) => void;
  getCloudTexture: () => THREE.Texture;
  /**
   * Pushes weather parameters from the world context into the cloud shader uniforms.
   * Call this every frame (or when a slider moves) so the GPU picks up UI changes.
   */
  setWeather: (
    world: {
      cloudWindX: number;
      cloudWindY: number;
      cloudSpeed: number;
      cloudScale: number;
      cloudDensity: number;
    },
    gameTime: number,
  ) => void;
  /**
   * Returns this object so callers can access setWeather after the fact.
   */
  getClouds: () => GpuClouds;
};

/**
 * Creates an initial cloud texture with no clouds (all zeros).
 */
const createInitialCloudTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA

  for (let i = 0; i < data.length; i += 4) {
    data[i + 0] = 0.0; // R: cloud density (initially no clouds)
    data[i + 1] = 0.0; // G: unused
    data[i + 2] = 0.0; // B: unused
    data[i + 3] = 1.0; // A: alpha
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

/**
 * Creates a GPU-based animated cloud computation system using the drifting cloud shader.
 *
 * This system renders procedural animated clouds to a texture using the GPUComputationRenderer.
 * The cloud patterns drift over time and can be sampled by other systems for various effects.
 *
 * Cloud configuration:
 * - Speed: How fast clouds move through the animation
 * - Scale: Size of cloud features
 * - Density: Controls cloud coverage and opacity
 * - DriftSpeed: Directional drift speed (x=horizontal, y=vertical)
 *
 * @param gpuCompute - The GPUComputationRenderer instance
 * @param width - Width of the computation texture (height will be same for square grid)
 * @param savedTexture - Optional saved state texture for recreation (for save/load support)
 * @returns GPU clouds system with variable and update function
 */
export const createGpuClouds = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  savedTexture?: THREE.DataTexture,
): GpuClouds => {
  logger.info("[gpu:clouds:create]");

  // Use saved texture if provided, otherwise create initial texture
  const cloudTexture = savedTexture || createInitialCloudTexture(width).texture;

  const cloudVariable = gpuCompute.addVariable(
    "cloudDensity",
    driftingCloudFragmentShader,
    cloudTexture,
  );

  gpuCompute.setVariableDependencies(cloudVariable, [cloudVariable]);

  // Cloud configuration
  const config = {
    driftSpeed: new THREE.Vector2(0.1, 0.05),
    speed: 0.1,
    scale: 1.5,
    density: 0.7,
  };

  // Initialize uniforms using typed uniform interface (new uniform type approach)
  const cloudUniforms = getUniforms<DriftingCloudUniforms>(
    cloudVariable.material,
  );
  cloudUniforms.uTime = { value: 0.0 };
  cloudUniforms.uDriftSpeed = { value: config.driftSpeed.clone() };
  cloudUniforms.uWindSetTime = { value: 0.0 };
  cloudUniforms.uAccumulatedDrift = { value: new THREE.Vector2(0, 0) };
  cloudUniforms.uSpeed = { value: config.speed };
  cloudUniforms.uScale = { value: config.scale };
  cloudUniforms.uDensity = { value: config.density };

  // Track when the current wind was set, the accumulated drift from all previous wind settings,
  // and the current wind direction for continuous offset transitions.
  let windSetTime = 0.0;
  let accumulatedDrift = new THREE.Vector2(0, 0);
  let previousWindX = config.driftSpeed.x;
  let previousWindY = config.driftSpeed.y;

  // Build the object, then attach getClouds as a self-reference
  const clouds: GpuClouds = {
    cloudVariable,
    updateClouds: (gameTime: number): void => {
      // Use global gameTime directly for save/load support
      cloudUniforms.uTime.value = gameTime;
    },
    getCloudTexture: (): THREE.Texture => {
      return gpuCompute.getCurrentRenderTarget(cloudVariable).texture;
    },
    setWeather: (world: {
      cloudWindX: number;
      cloudWindY: number;
      cloudSpeed: number;
      cloudScale: number;
      cloudDensity: number;
    }, gameTime: number): void => {
      // When wind direction changes, add the old wind's remaining contribution to
      // accumulatedDrift so the visual cloud position stays continuous (no jump).
      // The new wind direction then starts accumulating from windSetTime = gameTime.
      const windElapsed = gameTime - windSetTime;
      accumulatedDrift.x += previousWindX * windElapsed;
      accumulatedDrift.y += previousWindY * windElapsed;
      previousWindX = world.cloudWindX;
      previousWindY = world.cloudWindY;
      windSetTime = gameTime;

      cloudUniforms.uDriftSpeed.value.set(world.cloudWindX, world.cloudWindY);
      cloudUniforms.uWindSetTime.value = gameTime;
      cloudUniforms.uAccumulatedDrift.value.copy(accumulatedDrift);
      cloudUniforms.uSpeed.value = world.cloudSpeed;
      cloudUniforms.uScale.value = world.cloudScale;
      cloudUniforms.uDensity.value = world.cloudDensity;
    },
    getClouds: (): GpuClouds => clouds,
  };

  return clouds;
};
