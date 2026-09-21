import type { Variable } from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import { logger } from "@/utils/logger";

/**
 * Interface for GPU simulation state that can be saved/restored
 */
export interface GPUSimulationState {
  heightMapData: Float32Array | null;
  waterHeightData: Float32Array | null;
  velocityData: Float32Array | null;
  sedimentData: Float32Array | null;
  cloudsData: Float32Array | null;
  // The two substance compartments. They are saved together for the same reason load and delta travel together in
  // sedimentData: bacteria live in both, and a save that carries only one of them silently loses every ground
  // population (or invents a water column out of nothing) at exactly the moment the player expected continuity.
  waterQualityData: Float32Array | null;
  terrainQualityData: Float32Array | null;
  surfaceMaterialData: Float32Array | null; // Terrain painting texture data
  width: number;
  height: number;
  gameTime?: number; // Saved game time for proper resume
}

/**
 * The JSON shape of a saved simulation: every Float32Array becomes a plain number array, because JSON is the whole
 * persistence format here.
 *
 * This type exists so both directions of that conversion are checked against one definition. Writing the mapping out
 * by hand at each end - as this file's caller used to do, fourteen key names in two ternary lists - is how a field
 * ends up saved under one spelling and read under another: nothing errors, the world loads, and one population is
 * simply gone.
 *
 * The substance pair is optional because files written before substances were persisted lack those keys outright,
 * which is also how "no data" arrives from a save that had no such Variable in its graph.
 */
export type SerializedGpuSimulationState = {
  heightMapData: number[];
  waterHeightData: number[];
  velocityData: number[];
  sedimentData: number[];
  cloudsData: number[];
  surfaceMaterialData: number[];
  waterQualityData?: number[];
  terrainQualityData?: number[];
  width: number;
  height: number;
  gameTime?: number;
};

/**
 * The saved bytes as a JSON string, which is what storage.ts keeps in its snapshot.
 */
export const serializeGPUSimulationState = (
  state: GPUSimulationState,
): string => {
  /** Absent fields are written empty rather than omitted, matching the format every existing save uses. */
  const toNumbers = (data: Float32Array | null): number[] =>
    data ? Array.from(data) : [];

  const serialized: SerializedGpuSimulationState = {
    heightMapData: toNumbers(state.heightMapData),
    waterHeightData: toNumbers(state.waterHeightData),
    velocityData: toNumbers(state.velocityData),
    sedimentData: toNumbers(state.sedimentData),
    cloudsData: toNumbers(state.cloudsData),
    surfaceMaterialData: toNumbers(state.surfaceMaterialData),
    waterQualityData: toNumbers(state.waterQualityData),
    terrainQualityData: toNumbers(state.terrainQualityData),
    width: state.width,
    height: state.height,
    gameTime: state.gameTime,
  };

  return JSON.stringify(serialized);
};

/**
 * Read a snapshot written by serializeGPUSimulationState, including one from before a field existed.
 */
export const deserializeGPUSimulationState = (
  savedState: string,
): GPUSimulationState => {
  // The assertion is against a format this module writes, not against arbitrary input: every field below is then a
  // number[] or undefined, so nothing downstream gets to pretend about its shape.
  const parsed = JSON.parse(savedState) as SerializedGpuSimulationState;

  // An empty array means "this graph had no such Variable" (and is what older files wrote for it), so it becomes
  // null - the value createTexturesFromState zero-fills from. Turning [] into a zero-length Float32Array instead
  // would hand DataTexture an image with no texels in it.
  const toField = (data?: number[]): Float32Array | null =>
    data && data.length > 0 ? new Float32Array(data) : null;

  return {
    heightMapData: toField(parsed.heightMapData),
    waterHeightData: toField(parsed.waterHeightData),
    velocityData: toField(parsed.velocityData),
    sedimentData: toField(parsed.sedimentData),
    cloudsData: toField(parsed.cloudsData),
    surfaceMaterialData: toField(parsed.surfaceMaterialData),
    waterQualityData: toField(parsed.waterQualityData),
    terrainQualityData: toField(parsed.terrainQualityData),
    width: parsed.width,
    height: parsed.height,
    gameTime: parsed.gameTime,
  };
};

/**
 * Save ALL GPU simulation state from render targets
 * @param variables - Object containing all GPU computation variables
 * @param gpuCompute - GPUComputationRenderer instance
 * @param renderer - WebGLRenderer instance
 * @param gameTime - Current game time (optional, for proper resume)
 * @param surfaceMaterialTexture - Optional surface material texture to save
 */
export const saveGPUSimulationState = (
  variables: {
    heightMapVariable: Variable;
    waterHeightVariable: Variable;
    velocityVariable: Variable;
    sedimentVariable: Variable;
    cloudVariable: Variable;
    // Both are optional so a mini-graph exercising the four hydraulic fields can call this without inventing
    // substance state; production passes both, and a graph that has one without the other is a bug in the caller.
    waterQualityVariable?: Variable;
    terrainQualityVariable?: Variable;
  },
  gpuCompute: any, // GPUComputationRenderer
  renderer: THREE.WebGLRenderer,
  gameTime?: number,
  surfaceMaterialTexture?: THREE.Texture | null,
): GPUSimulationState | null => {
  const {
    heightMapVariable,
    waterHeightVariable,
    velocityVariable,
    sedimentVariable,
    cloudVariable,
    waterQualityVariable,
    terrainQualityVariable,
  } = variables;

  // Read from current render targets. The two substance Variables are read through exactly the same call as the
  // hydraulic five: they are committed fields like any other, and treating them as a special case is how one of
  // them ends up quietly absent from the file.
  const heightRenderTarget =
    gpuCompute.getCurrentRenderTarget(heightMapVariable);

  const width = heightRenderTarget.texture.image.width || 512;
  const height = heightRenderTarget.texture.image.height || 512;
  const size = width * height * 4; // RGBA format

  /** Bytes of one Variable's committed target, or null when this graph does not carry that field. */
  const readVariable = (variable?: Variable): Float32Array | null => {
    if (!variable) {
      return null;
    }
    const data = new Float32Array(size);
    renderer.readRenderTargetPixels(
      gpuCompute.getCurrentRenderTarget(variable),
      0,
      0,
      width,
      height,
      data,
    );
    return data;
  };

  const heightMapData = readVariable(heightMapVariable);
  const waterHeightData = readVariable(waterHeightVariable);
  const velocityData = readVariable(velocityVariable);
  const sedimentData = readVariable(sedimentVariable);
  const cloudsData = readVariable(cloudVariable);
  const waterQualityData = readVariable(waterQualityVariable);
  const terrainQualityData = readVariable(terrainQualityVariable);

  // Read surface material texture if provided
  let surfaceMaterialData: Float32Array | null = null;
  if (surfaceMaterialTexture) {
    const size = width * height * 4;

    // Read the surface material texture directly from its data array if available
    const textureAsDataTexture = surfaceMaterialTexture as THREE.DataTexture;
    const textureData =
      textureAsDataTexture.image && "data" in textureAsDataTexture.image
        ? (textureAsDataTexture.image.data as Float32Array | undefined)
        : undefined;
    if (textureData && textureData instanceof Float32Array) {
      // Copy directly from the texture's data array
      surfaceMaterialData = new Float32Array(textureData.slice(0, size));
    }
  }

  logger.info(
    { width, height, dataSize: size },
    "[gpu:save] Saved ALL GPU simulation state",
  );

  return {
    heightMapData,
    waterHeightData,
    velocityData,
    sedimentData,
    cloudsData,
    waterQualityData,
    terrainQualityData,
    surfaceMaterialData,
    width,
    height,
    gameTime,
  };
};

/**
 * Create initial textures from saved state for recreation
 */
export const createTexturesFromState = (
  state: GPUSimulationState,
): {
  heightMapTexture: THREE.DataTexture;
  waterHeightTexture: THREE.DataTexture;
  velocityTexture: THREE.DataTexture;
  sedimentTexture: THREE.DataTexture;
  cloudsTexture: THREE.DataTexture;
  // Seeded even when the file predates them, in which case createTexture's zero fill is what a fresh simulation
  // would have started with anyway - an empty substance field, rather than an uninitialized one.
  waterQualityTexture: THREE.DataTexture;
  terrainQualityTexture: THREE.DataTexture;
  surfaceMaterialTexture: THREE.DataTexture; // Terrain painting texture
} => {
  const { width, height } = state;

  const createTexture = (data: Float32Array | null) => {
    const textureData = data || new Float32Array(width * height * 4);
    const texture = new THREE.DataTexture(
      textureData,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    return texture;
  };

  return {
    heightMapTexture: createTexture(state.heightMapData),
    waterHeightTexture: createTexture(state.waterHeightData),
    velocityTexture: createTexture(state.velocityData),
    sedimentTexture: createTexture(state.sedimentData),
    cloudsTexture: createTexture(state.cloudsData),
    waterQualityTexture: createTexture(state.waterQualityData),
    terrainQualityTexture: createTexture(state.terrainQualityData),
    surfaceMaterialTexture: createTexture(state.surfaceMaterialData), // Terrain painting texture
  };
};

/**
 * Destroy all GPU computation variables and render targets
 * This is necessary before recreating the simulation with restored state
 */
export const destroyGpuSimulation = (variables: {
  heightMapVariable: Variable;
  waterHeightVariable: Variable;
  velocityVariable: Variable;
  sedimentVariable: Variable;
  cloudVariable: Variable;
  testingVariable?: Variable;
  waterQualityVariable?: Variable;
  terrainQualityVariable?: Variable;
}): void => {
  const allVariables = [
    variables.heightMapVariable,
    variables.waterHeightVariable,
    variables.velocityVariable,
    variables.sedimentVariable,
    variables.cloudVariable,
  ];

  // Optional Variables join the same disposal list, because a Variable whose render targets outlive its graph leaks
  // two full-resolution float textures per load - and the substance pair is exactly the state that must be dropped
  // before the restored one seeds the new graph.
  const optionalVariables = [
    variables.testingVariable,
    variables.waterQualityVariable,
    variables.terrainQualityVariable,
  ];

  for (const variable of optionalVariables) {
    if (variable) {
      allVariables.push(variable);
    }
  }

  for (const variable of allVariables) {
    // Dispose of render targets to free GPU memory
    if (variable.renderTargets) {
      for (const renderTarget of variable.renderTargets) {
        if (renderTarget && renderTarget.dispose) {
          renderTarget.dispose();
        }
      }
    }

    // Dispose of the texture if it exists
    if (variable.initialValueTexture) {
      variable.initialValueTexture.dispose();
    }

    // Dispose of material if it exists
    if (variable.material) {
      variable.material.dispose();
    }
  }

  logger.info(
    "[gpu:destroy] Destroyed all GPU simulation variables and render targets",
  );
};
