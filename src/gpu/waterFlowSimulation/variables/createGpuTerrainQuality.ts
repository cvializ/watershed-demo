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
  organicDecayRate: THREE.IUniform<number>;
  uTerrainSize: THREE.IUniform<number>;
  uDepositCount: THREE.IUniform<number>;
  uDepositPoints: THREE.IUniform<THREE.Vector4[]>;
} & SubstanceExchangeUniforms;

// Die-off of the ground population, first order like the water column's fade. Slower is pointless and faster would
// erase the thing this variable exists to remember: bacteria in the bed are what a catchment still carries after
// the flood that brought them has gone. Not calibrated to anything.
const DEFAULT_SOIL_DECAY_RATE = 0.02;

// Mineralisation of the organic matter sitting on the ground, so a grazed field weathers away instead of filling its
// texels forever. Slower than bacterial die-off on purpose: the manure is what the viewer follows into the stream, and
// it should outlast the rain that moves it rather than vanishing in the same shower. Not calibrated to anything.
const DEFAULT_ORGANIC_DECAY_RATE = 0.004;

// Frame-rate coupling (plan S6), with the same clamps createGpuWaterQuality uses - and for the exchange terms the
// clamps have to agree, since both shaders scale the same trade by dtScale.
const TARGET_FRAMES_PER_SECOND = 60;
const MIN_DT_SCALE = 0.25;
const MAX_DT_SCALE = 2.0;

/** Zero-filled initial state: ground that has never been contaminated or grazed. */
const createInitialTerrainQualityTexture = (
  size: number,
): THREE.DataTexture => {
  const data = new Float32Array(size * size * 4); // RGBA: R bacteria in the ground, G organic matter on it, BA unused

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
 * Two fields so far, each a companion of the water column's channel of the same name rather than a copy of it - hence
 * two variables per species. Bacterial content attaches to the bed and trades with the film above it in both
 * directions; organic matter lies on the ground (animals drop it there - see `addOrganicDeposit`) and only ever leaves,
 * scoured off by whatever water covers the cell. This compartment does not advect: transport belongs to whatever water
 * covers the cell (see `createGpuWaterQuality`) and mineral movement belongs to sediment-flow.frag, which currently moves
 * grains and neither of these populations.
 *
 * Exchange with the flow happens at both ends of a shared, pure helper: `terrain-quality.frag` and
 * `water-quality.frag` each evaluate `exchangeAt` on the same committed texel, so settling and wash-off are two
 * readings of one number rather than two guesses. Total bacteria (this compartment plus the water column's) is
 * therefore conserved across a pass except where decay intends to remove it - asserted in
 * tests/test-gpu-water-quality.ts.
 *
 * A dry cell neither gains nor loses - except from a deposit, which is the one way mass enters a dry cell: no film means
 * nothing to carry bacteria down and nothing to lift anything back up, which is what lets contamination, and a grazed
 * field, persist on the landscape after water has gone. Sediment burial is not modeled; eroding or depositing the bed
 * leaves these fields where they were (README).
 *
 * Persistence: saved and restored alongside the water column, which is the only correct pairing - a ground field with
 * no water above it, or a plume with none of its settled share beneath it, is half a bacterial census. See the
 * matching note in createGpuWaterQuality.
 */
/** Must match `uDepositPoints[8]` / `uDepositCount` in terrain-quality.frag. */
const MAX_ORGANIC_DEPOSITS = 8;

/**
 * A deposit as the shader wants it: centre, radius and amount in world units, where amount is mass per pass at 60 fps
 * (the shader scales it by dtScale). Same shape a pollutant source has, for the same reason - one soft disc law across
 * the whole substance model.
 */
export type OrganicDeposit = {
  x: number;
  y: number;
  radius: number;
  amount: number;
};

export const createGpuTerrainQuality = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  terrainSize: number,
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
      uniforms.organicDecayRate = { value: DEFAULT_ORGANIC_DECAY_RATE };
      // World units are what a depositor speaks in, so the shader needs the grid's physical edge to place one.
      uniforms.uTerrainSize = { value: terrainSize };
      // Same values the water column was given, and for the same reason: one trade, two ledgers.
      uniforms.soilAttachRate = {
        value: SUBSTANCE_EXCHANGE_RATES.soilAttachRate,
      };
      uniforms.washOffRate = { value: SUBSTANCE_EXCHANGE_RATES.washOffRate };
      uniforms.organicWashOffRate = {
        value: SUBSTANCE_EXCHANGE_RATES.organicWashOffRate,
      };
      uniforms.uDepositCount = { value: 0 };
      uniforms.uDepositPoints = {
        value: Array.from(
          { length: MAX_ORGANIC_DEPOSITS },
          () => new THREE.Vector4(0.0, 0.0, 0.0, 0.0),
        ),
      };
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

    /**
     * Drops one load of organic matter on the ground, at the world position a grazing animal stands in.
     *
     * Deposits are per-pass declarations rather than landscape features: `compute()` clears them after every step,
     * exactly like water sources, so a depositor that wants to keep releasing has to keep declaring. That is what lets
     * a moving animal draw a pat where it stands instead of painting the whole field behind an emitter that outlived
     * the visit.
     *
     * @param deposit - Centre, disc radius and mass released per pass at 60 fps (scaled by dtScale)
     * @returns false when every deposit slot is busy for this pass; nothing is added in that case
     */
    addOrganicDeposit: ({ x, y, radius, amount }: OrganicDeposit): boolean => {
      const count = uniforms.uDepositCount.value;
      if (count >= MAX_ORGANIC_DEPOSITS) {
        logger.warn(
          { x, y, maxDeposits: MAX_ORGANIC_DEPOSITS },
          "Organic deposit slots full",
        );
        return false;
      }

      uniforms.uDepositPoints.value[count].set(x, y, radius, amount);
      uniforms.uDepositCount.value = count + 1;
      logger.debug(
        { x, y, radius, amount },
        "[gpu:terrain-quality:deposit] organic matter dropped",
      );
      return true;
    },

    /**
     * Forgets the deposits declared since the last pass. Called by `compute()` once they have been consumed.
     */
    clearOrganicDeposits: (): void => {
      const points = uniforms.uDepositPoints.value;
      for (let index = 0; index < points.length; index++) {
        points[index].set(0.0, 0.0, 0.0, 0.0);
      }
      uniforms.uDepositCount.value = 0;
    },

    getTerrainQualityUniforms: () =>
      getUniforms<TerrainQualityUniforms>(terrainQualityVariable.material),
  };
};
