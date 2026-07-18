import type { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

/**
 * Uniform interface for water sources computation shader.
 * Each water source is represented as a vec4: (x, y, radius, amount).
 */
export type WaterSourcesUniforms = {
  terrainHeightmap: THREE.IUniform<THREE.Texture>;
  uTerrainSize: THREE.IUniform<number>;
  uWaterSourceCount: THREE.IUniform<number>;
  uWaterSourcePoints: THREE.IUniform<THREE.Vector4[]>;
};

import waterSourcesFragmentShader from "@/shaders/compute/water-sources.frag?raw";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * Creates the fragment shader for computing water sources.
 *
 * This shader renders water source points to a texture using the GPUComputationRenderer.
 * Each water source is represented as a soft-edged circular amount based on its position,
 * radius, and amount. The result is a texture where each pixel contains the total
 * water source amount at that world position.
 */

/**
 * Creates an initial water sources texture with no water sources (all zeros).
 */
const createInitialWaterSourcesTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA
  const initialSourceAmount = 0.0; // No water sources initially

  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = initialSourceAmount; // R: water source amount
    data[i * 4 + 1] = 0.0; // G: unused
    data[i * 4 + 2] = 0.0; // B: unused
    data[i * 4 + 3] = 1.0; // A: alpha
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return { texture, data };
};

export const createGpuWaterSources = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  heightMapTexture: THREE.Texture,
  terrainSize: number,
) => {
  const { texture: waterSourcesTexture } = createInitialWaterSourcesTexture(width);
  const waterSourcesVariable = gpuCompute.addVariable(
    "waterSources",
    waterSourcesFragmentShader,
    waterSourcesTexture,
  );
  gpuCompute.setVariableDependencies(waterSourcesVariable, [waterSourcesVariable]);

  const uniforms = getUniforms<WaterSourcesUniforms>(waterSourcesVariable.material);

  return {
    waterSourcesVariable,
    initWaterSources: () => {
      uniforms.terrainHeightmap = { value: heightMapTexture };
      uniforms.uTerrainSize = { value: terrainSize };
      uniforms.uWaterSourceCount = { value: 0 };
      uniforms.uWaterSourcePoints = {
        value: (() => {
          // Add water sources uniforms (array of vec4: x, y, radius, amount)
          const waterSourceUniforms: THREE.Vector4[] = [];
          for (let i = 0; i < 16; i++) {
            waterSourceUniforms.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
          }
          return waterSourceUniforms;
        })(),
      };
    },
    addWater: (x: number, y: number, amount: number, radius: number) => {
      addWater(uniforms, x, y, amount, radius);
    },
    clearWater: () => {
      // Clear water sources for next frame (they've been consumed by the simulation)
      const sourceArray = uniforms.uWaterSourcePoints.value;
      for (let i = 0; i < sourceArray.length; i++) {
        sourceArray[i].set(0.0, 0.0, 0.0, 0.0);
      }
      uniforms.uWaterSourceCount.value = 0;
    },
  };
};

/**
 * Utility function to add water at a specific location on the terrain.
 * Sets a uniform with the source point coordinates which the water sources shader uses to add water.
 * The uniform is cleared after each simulation step (water sources are consumed).
 *
 * @param uniforms - The water sources uniforms object
 * @param x - X coordinate in world space (0 to terrainSize)
 * @param y - Y coordinate in world space (0 to terrainSize)
 * @param amount - Amount of water to add
 * @param radius - Radius of the water circle in world units
 */
const addWater = (
  uniforms: WaterSourcesUniforms,
  x: number,
  y: number,
  amount: number,
  radius: number,
) => {
  // Set the water source point uniform
  const sourcesUniform = uniforms.uWaterSourcePoints;
  const countUniform = uniforms.uWaterSourceCount;

  // Add water source to the first available slot
  const currentCount = countUniform.value;
  if (currentCount < 16) {
    sourcesUniform.value[currentCount].set(x, y, radius, amount);
    countUniform.value = currentCount + 1;
    console.log("Water source added:", { x, y, radius, amount, count: countUniform.value });
  } else {
    throw new Error("TOO MANY COUNT");
  }
};
