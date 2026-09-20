import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import waterQualityFragmentShader from "@/shaders/compute/water-quality.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * The four tracked substances, in the order `water-quality.frag` packs them into a texel and the order
 * `water-visualization.frag` tints them with. Channel A is a substance, not an alpha: this texture is only ever
 * sampled by hand, never composited as a colour map.
 *
 * The indices are stored in source textures and in saved worlds one day, so renumbering would silently relabel
 * every plume; append instead. `src/shaders/compute/water-quality.frag` and the two visualization files repeat
 * this order as literals because GLSL cannot import TypeScript - keep them in step by hand for now.
 */
export const POLLUTANT_SPECIES = [
  { id: 0, label: "Nitrogen" },
  { id: 1, label: "Organic matter" },
  { id: 2, label: "Oxygen" },
  { id: 3, label: "Bacteria" },
] as const;

export type PollutantSpeciesId = (typeof POLLUTANT_SPECIES)[number]["id"];

/** Uniforms for the water quality computation; dependency samplers are deliberately absent (see README s1). */
export type WaterQualityUniforms = {
  uTerrainSize: THREE.IUniform<number>;
  fluxFraction: THREE.IUniform<number>;
  dtScale: THREE.IUniform<number>;
  decayRate: THREE.IUniform<number>;
  uInjectCount: THREE.IUniform<number>;
  uInjectPoints: THREE.IUniform<THREE.Vector4[]>;
  uInjectSpecies: THREE.IUniform<number[]>;
};

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
 * is moved rather than minted: with decay switched off, the grid sum of each channel is constant pass to pass,
 * except where a cell would export off-grid and keeps its load instead (border retention).
 *
 * Channels hold column-integrated mass (concentration times depth), not concentration. water-height.frag removes
 * water by infiltration and drainage; substance that tracked concentration would vanish with it, whereas mass
 * stays behind and concentrates, which is both cheaper to account for and closer to what a puddle does.
 *
 * Sources are persistent emitters rather than one-shot doses: `addPollutantSource` registers a soft disc that
 * releases `amount` per pass at 60 fps until `clearPollutantSources()` runs. A farm patch, a septic outflow or a
 * river mouth then keeps feeding a plume, which is what makes the transport visible in the first place.
 *
 * Not persisted by save/load yet: add this variable to `getAllVariables()`, `SavedSimulationTextures` and
 * `saveLoadSimulationState.ts` together if the field needs to survive a reload.
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
     * @param species - Channel to feed, see POLLUTANT_SPECIES
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

    getWaterQualityUniforms: () =>
      getUniforms<WaterQualityUniforms>(waterQualityVariable.material),
  };
};
