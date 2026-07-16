import type { GPUComputationRenderer, Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import driftingCloudFragmentShader from "@/shaders/compute/drifting-cloud.frag?raw";

export type GpuClouds = {
  cloudVariable: Variable;
  updateClouds: (deltaTime: number) => void;
  getCloudTexture: () => THREE.Texture;
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

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
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
 * @returns GPU clouds system with variable and update function
 */
export const createGpuClouds = (gpuCompute: GPUComputationRenderer, width: number): GpuClouds => {
  const { texture: cloudTexture } = createInitialCloudTexture(width);

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

  // Initialize uniforms (must be set before updateClouds is called)
  cloudVariable.material.uniforms = {
    uTime: { value: 0.0 },
    uDriftSpeed: { value: config.driftSpeed.clone() },
    uSpeed: { value: config.speed },
    uScale: { value: config.scale },
    uDensity: { value: config.density },
  };

  let currentTime = 0;

  // Update clouds
  const updateClouds = (deltaTime: number): void => {
    currentTime += deltaTime;

    // Update uniforms for cloud animation
    cloudVariable.material.uniforms.uTime.value = currentTime;
  };

  // Get the cloud texture from GPU computation render target
  const getCloudTexture = (): THREE.Texture => {
    return gpuCompute.getCurrentRenderTarget(cloudVariable).texture;
  };

  return {
    cloudVariable,
    updateClouds: (deltaTime: number) => {
      updateClouds(deltaTime);
    },
    getCloudTexture,
  };
};
