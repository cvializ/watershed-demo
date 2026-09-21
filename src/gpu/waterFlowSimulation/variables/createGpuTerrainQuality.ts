import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import terrainQualityFragmentShader from "@/shaders/compute/terrain-quality.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

import {
  SUBSTANCE_EXCHANGE_RATES,
  type SubstanceExchangeUniforms,
} from "./substanceExchange";

/**
 * Uniforms for the terrain-side substance computation; dependency samplers are deliberately absent (README s1).
 */
export type TerrainQualityUniforms = {
  dtScale: THREE.IUniform<number>;
  soilDecayRate: THREE.IUniform<number>;
} & SubstanceExchangeUniforms;

// Die-off of the ground population, first order like the water column's fade. Slower is pointless and faster would
// erase the thing this variable exists to remember: bacteria in the bed are what a catchment still carries after
// the flood that brought them has gone. Not calibrated to anything.
const DEFAULT_SOIL_DECAY_RATE = 0.02;

// Frame-rate coupling (plan S6), with the same clamps createGpuWaterQuality uses - and for the exchange terms the
// clamps have to agree, since both shaders scale the same trade by dtScale.
const TARGET_FRAMES_PER_SECOND = 60;
const MIN_DT_SCALE = 0.25;
const MAX_DT_SCALE = 2.0;

/** Zero-filled initial state: ground that has never been contaminated. */
const createInitialTerrainQualityTexture = (
  size: number,
): THREE.DataTexture => {
  const data = new Float32Array(size * size * 4); // RGBA: R bacteria in the ground, GBA unused

  for (let index = 0; index < size * size; index++) {
    data[index * 4 + 3] = 0.0; // A is a substance channel elsewhere; here it stays empty rather than opaque
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;
  return texture;
};

/**
 * Creates the terrain-side substance computation: what the ground is holding.
 *
 * The one field so far is bacterial content attached to the bed, and it is a companion to the water column's
 * bacteria channel rather than a copy of it - hence two variables for one species. This compartment does not
 * advect: it is in the ground, so transport belongs to whatever water covers the cell (see
 * `createGpuWaterQuality`) and mineral movement belongs to sediment-flow.frag, which currently moves grains and
 * not this population.
 *
 * Exchange with the flow happens at both ends of a shared, pure helper: `terrain-quality.frag` and
 * `water-quality.frag` each evaluate `exchangeAt` on the same committed texel, so settling and wash-off are two
 * readings of one number rather than two guesses. Total bacteria (this compartment plus the water column's) is
 * therefore conserved across a pass except where decay intends to remove it - asserted in
 * tests/test-gpu-water-quality.ts.
 *
 * A dry cell neither gains nor loses: no film means nothing to carry bacteria down and nothing to lift them back,
 * which is what lets contamination persist on the landscape after water has gone. Sediment burial is not modeled;
 * eroding or depositing the bed leaves this field where it was (README).
 *
 * Persistence: saved and restored alongside the water column, which is the only correct pairing - a ground field with
 * no water above it, or a plume with none of its settled share beneath it, is half a bacterial census. See the
 * matching note in createGpuWaterQuality.
 */
export const createGpuTerrainQuality = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  waterHeightVariable: Variable,
  waterQualityVariable: Variable,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:terrain-quality:create]");

  const terrainQualityVariable = gpuCompute.addVariable(
    "terrainQuality",
    terrainQualityFragmentShader,
    savedTexture || createInitialTerrainQualityTexture(width),
  );

  // Declared exactly once, here (plan S2): depth decides whether the two compartments can trade at all, the water
  // column supplies what settles, and the self-dependency carries last pass's ground population. The reverse edge
  // - water quality reading this variable - is added by linkWaterQualityToTerrain in that factory, because both
  // Variables have to exist before either list can name the other (README s1).
  gpuCompute.setVariableDependencies(terrainQualityVariable, [
    waterHeightVariable,
    waterQualityVariable,
    terrainQualityVariable,
  ]);

  const uniforms = getUniforms<TerrainQualityUniforms>(
    terrainQualityVariable.material,
  );

  return {
    terrainQualityVariable,
    /**
     * Binds the constants that cannot be decided at variable-creation time.
     */
    initTerrainQuality: (): void => {
      uniforms.dtScale = { value: 1.0 }; // neutral until the first update
      uniforms.soilDecayRate = { value: DEFAULT_SOIL_DECAY_RATE };
      // Same values the water column was given, and for the same reason: one trade, two ledgers.
      uniforms.soilAttachRate = {
        value: SUBSTANCE_EXCHANGE_RATES.soilAttachRate,
      };
      uniforms.washOffRate = { value: SUBSTANCE_EXCHANGE_RATES.washOffRate };
    },

    /**
     * Re-scales the per-pass coefficients for this frame's elapsed time (plan S6).
     */
    updateTerrainQuality: (deltaTime: number): void => {
      uniforms.dtScale.value = Math.min(
        MAX_DT_SCALE,
        Math.max(MIN_DT_SCALE, deltaTime * TARGET_FRAMES_PER_SECOND),
      );
    },

    getTerrainQualityUniforms: () =>
      getUniforms<TerrainQualityUniforms>(terrainQualityVariable.material),
  };
};
