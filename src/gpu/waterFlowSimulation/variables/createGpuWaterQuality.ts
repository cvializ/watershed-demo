import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import waterQualityFragmentShader from "@/shaders/compute/water-quality.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

import {
  BACTERIA_GROWTH,
  ORGANIC_DEPOSIT_THRESHOLD,
  SUBSTANCE_EXCHANGE_RATES,
  type SubstanceExchangeUniforms,
  type SubstanceGrowthUniforms,
} from "./substanceExchange";

/**
 * Which compartment a substance can be stored in. `water` means the column this variable owns; `terrain` means
 * the ground, owned by `createGpuTerrainQuality`. A species with both is exchanged between them every pass.
 */
type SubstanceCompartment = "water" | "terrain";

/**
 * Channel index of a tracked substance, and therefore its position in `POLLUTANT_SPECIES`. Appending a species
 * means appending to the union as well: the indices are stored in textures and in saved worlds one day, so
 * renumbering would silently relabel every plume.
 */
export type PollutantSpeciesId = 0 | 1 | 2 | 3;

/** One tracked substance: what to call it, and where it is allowed to be stored. */
export type PollutantSpecies = {
  id: PollutantSpeciesId;
  label: string;
  compartments: readonly SubstanceCompartment[];
};

/**
 * The four tracked substances, in the order `water-quality.frag` packs them into a texel and the order
 * `water-visualization.frag` tints them with. Channel A is a substance, not an alpha: this texture is only ever
 * sampled by hand, never composited as a colour map.
 *
 * `compartments` is the model's own answer to "whose property is this?". Dissolved oxygen belongs to the water
 * alone: it thins out with the film around it and cannot be banked in dry ground (see water-quality.frag).
 * Two species have two homes - nitrogen stays dissolved, organic matter does not but still only leaves the ground
 * with water. For each of them the channel here is its share of the water column, while `terrain-quality.frag` holds
 * the share on or in the ground (bacteria in R, organic matter in G). Bacteria trade both ways, and they settle out
 * of a film only where the ground holds organic matter for them to live on; organic matter only ever crosses from
 * the ground into a film, which is why animals are the only way it gets there.
 *
 * Bacteria also grow rather than only move: whatever organic matter a compartment is holding, it converts some of it
 * into more bacteria (BACTERIA_GROWTH), each compartment spending its own carbon. That is the only way this model
 * ever produces bacteria at all - nothing seeds them otherwise - so a film that reaches a pat picks up a population
 * it did not carry in, and a grazed field turns magenta without anyone injecting anything.
 *
 * `src/shaders/compute/water-quality.frag` and the visualization files repeat this order as literals because GLSL
 * cannot import TypeScript - keep them in step by hand for now.
 */
export const POLLUTANT_SPECIES: readonly PollutantSpecies[] = [
  { id: 0, label: "Nitrogen", compartments: ["water"] },
  {
    id: 1,
    label: "Organic matter (water & soil)",
    compartments: ["terrain", "water"],
  },
  { id: 2, label: "Dissolved oxygen", compartments: ["water"] },
  {
    id: 3,
    label: "Bacteria (water & soil)",
    compartments: ["water", "terrain"],
  },
];

/**
 * Uniforms for the water quality computation; dependency samplers are deliberately absent (see README s1).
 * The exchange coefficients and the organic threshold that conditions the bacterial deposit come from
 * SUBSTANCE_EXCHANGE_RATES and ORGANIC_DEPOSIT_THRESHOLD so this variable and the terrain one cannot be given
 * different halves of the same trade, and the growth coefficients come from BACTERIA_GROWTH for the same reason -
 * though that law is applied to each compartment's own channels rather than traded between them.
 */
export type WaterQualityUniforms = {
  uTerrainSize: THREE.IUniform<number>;
  fluxFraction: THREE.IUniform<number>;
  dtScale: THREE.IUniform<number>;
  decayRate: THREE.IUniform<number>;
  uInjectCount: THREE.IUniform<number>;
  uInjectPoints: THREE.IUniform<THREE.Vector4[]>;
  uInjectSpecies: THREE.IUniform<number[]>;
} & SubstanceExchangeUniforms &
  SubstanceGrowthUniforms;

/** Must match `uInjectPoints[8]` / `uInjectSpecies[8]` in water-quality.frag. */
const MAX_POLLUTANT_SOURCES = 8;

// Mirrors the flux law water-height.frag applies to the water itself (simulationSpeed 0.5 there), so a parcel of
// substance leaves a cell at the same rate as the water carrying it. FLUX_CEILING in the shader caps dtScaling.
const DEFAULT_FLUX_FRACTION = 0.5;

// Gentle first-order fade: enough that a plume stops short of carpeting the whole catchment over a long run,
// small enough that transport is still what decides where substance ends up. Not calibrated to anything.
const DEFAULT_DECAY_RATE = 0.01;

// Frame-rate coupling (plan S6), with the same clamps createGpuSedimentFlow uses.
const TARGET_FRAMES_PER_SECOND = 60;
const MIN_DT_SCALE = 0.25;
const MAX_DT_SCALE = 2.0;

/** Zero-filled initial state: a clean catchment, all four channels empty. */
const createInitialWaterQualityTexture = (size: number): THREE.DataTexture => {
  const data = new Float32Array(size * size * 4); // RGBA: nitrogen, organic matter, oxygen, bacteria

  for (let index = 0; index < size * size; index++) {
    data[index * 4 + 3] = 0.0; // A is the bacteria channel here, so it starts empty rather than opaque
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
 * Creates the water quality computation: dissolved substance riding on top of the flow.
 *
 * Transport is deliberately not its own downslope calculation. `water-velocity.frag` already announces a route
 * (unit downslope direction times speed) and this variable's shader snaps back to the canonical D8 step it was
 * emitted from, which is the same trick `sediment-flow.frag` uses - so plumes follow the water even though this
 * shader never reads terrain. Export and import re-evaluate one shared helper on the exporter's texel, so mass
 * is moved rather than minted: with decay switched off and the growth law switched off, the grid sum of each channel
 * is constant pass to pass, except where a cell would export off-grid and keeps its load instead (border retention).
 * Growth is the one place mass changes channel without leaving the cell - organic converts into bacteria - so the
 * invariant to hold is the sum of those two channels, not either one alone.
 *
 * Channels hold column-integrated mass (concentration times depth), not concentration. water-height.frag removes
 * water by infiltration and drainage; substance that tracked concentration would vanish with it, whereas mass
 * stays behind and concentrates, which is both cheaper to account for and closer to what a puddle does - for the
 * substances that belong to the ground at all. Dissolved oxygen is the deliberate exception: it is a property of
 * the water alone, so it thins out with the film around it rather than being left behind as a deposit.
 *
 * Two species have two compartments rather than one. This variable holds the share dissolved or suspended in the
 * flow; `createGpuTerrainQuality` holds the share on or in the ground. Both shaders evaluate the same exchange helper
 * on the same committed texel, so mass crosses between them exactly - which is why this variable's dependency list is
 * completed by linkWaterQualityToTerrain() once the terrain variable exists (README s1). Bacteria cross both ways,
 * but they only settle out of the film onto ground that holds organic matter, so a plume rides across clean ground and
 * drops its load wherever the catchment has something for it to feed on; organic matter arrives in the flow from the
 * ground only, since nothing in a stream settles down and becomes litter.
 *
 * On top of that trade, each compartment eats its own organic matter: `growthAt` (BACTERIA_GROWTH) converts a
 * fraction of whatever organic the cell holds into bacteria in the same compartment, seeded even where there were
 * none. That is why the two textures have to be read together - a film over a pat and the soil beneath it are the
 * same population working through the same carbon, from two sides.
 *
 * Sources are persistent emitters rather than one-shot doses: `addPollutantSource` registers a soft disc that
 * releases `amount` per pass at 60 fps until `clearPollutantSources()` runs. A farm patch, a septic outflow or a
 * river mouth then keeps feeding a plume, which is what makes the transport visible in the first place.
 *
 * Persistence: this Variable and its terrain partner are listed together in `getAllVariables()` and read as a pair by
 * `saveLoadSimulationState.ts`, because restoring the water column without the ground would resurrect a bacterial
 * population missing every cell that settled into soil. The savedTexture argument below is how a load seeds them.
 */
export const createGpuWaterQuality = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  terrainSize: number,
  waterVelocityVariable: Variable,
  waterHeightVariable: Variable,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:water-quality:create]");

  const waterQualityVariable = gpuCompute.addVariable(
    "waterQuality",
    waterQualityFragmentShader,
    savedTexture || createInitialWaterQualityTexture(width),
  );

  // Declared exactly once, here (plan S2): the velocity field supplies the route, depth decides whether a cell
  // can carry anything at all, and the self-dependency carries the previous frame's mass.
  gpuCompute.setVariableDependencies(waterQualityVariable, [
    waterVelocityVariable, // announced route: direction * speed
    waterHeightVariable, // wetness of the carrying cell
    waterQualityVariable, // self: substance already in place
  ]);

  const uniforms = getUniforms<WaterQualityUniforms>(
    waterQualityVariable.material,
  );

  return {
    waterQualityVariable,
    /**
     * Binds the constants that cannot be decided at variable-creation time.
     */
    initWaterQuality: (): void => {
      uniforms.uTerrainSize = { value: terrainSize };
      uniforms.fluxFraction = { value: DEFAULT_FLUX_FRACTION };
      uniforms.dtScale = { value: 1.0 }; // neutral until the first update
      uniforms.decayRate = { value: DEFAULT_DECAY_RATE };
      uniforms.soilDepositRate = {
        value: SUBSTANCE_EXCHANGE_RATES.soilDepositRate,
      };
      uniforms.organicDepositThreshold = {
        value: ORGANIC_DEPOSIT_THRESHOLD,
      };
      uniforms.washOffRate = { value: SUBSTANCE_EXCHANGE_RATES.washOffRate };
      uniforms.organicWashOffRate = {
        value: SUBSTANCE_EXCHANGE_RATES.organicWashOffRate,
      };
      // ...and the same for the growth law, so a film and the ground under it cannot disagree about how fast
      // organic turns into bacteria. Both are applied to this cell's own channels, so neither side has to
      // balance a ledger against the other the way the exchange legs do.
      uniforms.organicConversionRate = {
        value: BACTERIA_GROWTH.organicConversionRate,
      };
      uniforms.growthGain = { value: BACTERIA_GROWTH.growthGain };
      uniforms.uInjectCount = { value: 0 };
      uniforms.uInjectPoints = {
        value: Array.from(
          { length: MAX_POLLUTANT_SOURCES },
          () => new THREE.Vector4(0.0, 0.0, 0.0, 0.0),
        ),
      };
      uniforms.uInjectSpecies = {
        value: Array.from({ length: MAX_POLLUTANT_SOURCES }, () => 0.0),
      };
    },

    /**
     * Re-scales the per-pass coefficients for this frame's elapsed time (plan S6).
     */
    updateWaterQuality: (deltaTime: number): void => {
      const dtScale = Math.min(
        MAX_DT_SCALE,
        Math.max(MIN_DT_SCALE, deltaTime * TARGET_FRAMES_PER_SECOND),
      );
      uniforms.dtScale.value = dtScale;
    },

    /**
     * Registers a persistent emitter of one substance at a world position.
     * @param x - X coordinate in world space (0 to terrainSize)
     * @param y - Y coordinate in world space (0 to terrainSize)
     * @param radius - Radius of the emitting disc in world units
     * @param amount - Mass released per pass at 60 fps, scaled by dtScale
     * @param species - Channel to feed, see POLLUTANT_SPECIES. Dissolved oxygen only lands where there is water:
     *   it is a property of the column rather than of the ground, so an emitter on dry cells releases nothing.
     *   Organic matter released here joins the film only; the ground's share comes from animals
     *   (`createGpuTerrainQuality.addOrganicDeposit`), not from an emitter aimed at the water. Bacteria released here
     *   ride the flow until they reach ground with organic matter on it, where they settle out (see
     *   SUBSTANCE_EXCHANGE_RATES). You do not have to release any bacteria to see them, though: organic matter
     *   seeds a population wherever there is water to do it in (see BACTERIA_GROWTH), and that population then
     *   multiplies on whatever carbon is left in the film.
     * @returns false when all emitter slots are busy; nothing is added in that case
     */
    addPollutantSource: (
      x: number,
      y: number,
      radius: number,
      amount: number,
      species: PollutantSpeciesId,
    ): boolean => {
      const count = uniforms.uInjectCount.value;
      if (count >= MAX_POLLUTANT_SOURCES) {
        logger.warn(
          { x, y, species, maxSources: MAX_POLLUTANT_SOURCES },
          "Pollutant source slots full",
        );
        return false;
      }

      uniforms.uInjectPoints.value[count].set(x, y, radius, amount);
      uniforms.uInjectSpecies.value[count] = species;
      uniforms.uInjectCount.value = count + 1;
      logger.debug({ x, y, radius, amount, species }, "Pollutant source added");
      return true;
    },

    /**
     * Forgets every emitter. Already-released substance keeps flowing; only new release stops.
     */
    clearPollutantSources: (): void => {
      const points = uniforms.uInjectPoints.value;
      for (let index = 0; index < points.length; index++) {
        points[index].set(0.0, 0.0, 0.0, 0.0);
        uniforms.uInjectSpecies.value[index] = 0.0;
      }
      uniforms.uInjectCount.value = 0;
    },

    /**
     * Declares the terrain half of this variable's bacterial exchange. Called by the orchestrator once both
     * variables exist, because GPUComputationRenderer needs a Variable object before any dependency list can
     * name it - the same reason createGpuTerrainHeight returns linkBedToSediment (plan A12).
     *
     * The resulting waterQuality <-> terrainQuality cycle is not a hazard: compute() binds every dependency to
     * the frame being committed, so both sides of the trade read identical numbers in the same pass.
     */
    linkWaterQualityToTerrain: (terrainQualityVariable: Variable): void => {
      gpuCompute.setVariableDependencies(waterQualityVariable, [
        waterVelocityVariable,
        waterHeightVariable,
        terrainQualityVariable,
        waterQualityVariable,
      ]);
    },

    getWaterQualityUniforms: () =>
      getUniforms<WaterQualityUniforms>(waterQualityVariable.material),
  };
};
