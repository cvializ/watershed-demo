/**
 * CPU reference for `src/shaders/compute/water-quality.frag` and its terrain partner
 * `src/shaders/compute/terrain-quality.frag`.
 *
 * This mirrors both shaders' arithmetic channel by channel so the GPU test can compare whole textures against a
 * model instead of hand-derived expectations, which is what catches a future edit to one side drifting from the
 * other. It follows them deliberately - including their quirks: transport authority is the velocity field; water
 * depth plays no part in routing but decides oxygen and exchange (so it is a parameter here); export fractions are
 * recomputed per texel; and border cells keep their load rather than leaking it off-grid. Where the two must stay
 * in step the shader is cited by section.
 *
 * Two compartments:
 * - waterMass:  index 0 nitrogen, 1 organic matter, 2 dissolved oxygen, 3 bacteria (column-integrated mass)
 * - groundMass: index 0 bacterial content bound to the ground, index 1 organic matter on it; 2..3 unused, matching
 *   terrain-quality.frag
 *
 * Growth is modelled as a conversion, not a transfer: whichever compartment holds organic matter spends some of it
 * on bacteria of its own (`growthFor` mirrors `growthAt` in both shaders), so the pair to keep an eye on across a
 * pass is organic plus bacteria rather than either channel alone.
 */

// Channel ids come from the production module so this model cannot drift out of its layout (plan: channels are
// load-bearing, not colours). The one threshold of the exchange law is taken from production too, since it is a
// property of the law rather than a knob a scenario tunes. Same for the growth law's two coefficients, which are
// properties of the law too: a scenario that switches growth on has to start from the rates production runs on.
import type { PollutantSpeciesId } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts";

import {
  BACTERIA_GROWTH,
  ORGANIC_DEPOSIT_THRESHOLD,
} from "@/gpu/waterFlowSimulation/variables/substanceExchange.ts";

const DIRECTION_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // North
  [1, 1], // Northeast
  [1, 0], // East
  [1, -1], // Southeast
  [0, -1], // South
  [-1, -1], // Southwest
  [-1, 0], // West
  [-1, 1], // Northwest
];

const EPS = 1e-7;

// The shaders clamp their coefficients; the reference has to clamp identically or a stress case would disagree.
const FLUX_CEILING = 0.75;
const DECAY_CEILING = 0.25;
const EXCHANGE_CEILING = 0.15;
// Taken from production rather than copied, since the ceiling is part of the law and a scenario that runs the law
// at its ceiling has to be measured against the same number the shaders clamp to.
const GROWTH_CEILING = BACTERIA_GROWTH.growthCeiling;

// Depth at and above which a cell counts as holding standing water: below it, dissolved oxygen is gone and the two
// compartments cannot trade. Same constant in both shaders, tied to water-visualization.frag's wet threshold.
export const WET_DEPTH = 0.01;

/** Water channel indices, spelled out because their meaning differs per channel (oxygen dries, both others trade). */
const CHANNEL_ORGANIC = 1;
const CHANNEL_OXYGEN = 2;
const CHANNEL_BACTERIA = 3;

/** Ground channel indices, in the same order as the water channels they are the other half of. */
const GROUND_CHANNEL_BACTERIA = 0;
const GROUND_CHANNEL_ORGANIC = 1;

/** Per-pass coefficients, matching the uniforms createGpuWaterQuality and createGpuTerrainQuality write. */
export type WaterQualityOptions = {
  fluxFraction: number;
  dtScale: number;
  decayRate: number;
  soilDepositRate: number;
  organicDepositThreshold: number;
  washOffRate: number;
  organicWashOffRate: number;
  soilDecayRate: number;
  organicDecayRate: number;
  organicConversionRate: number;
  growthGain: number;
};

// The conservation harness wants a pure transport step, so fade, die-off, the bacterial exchange and the growth law
// all default to off and dtScale to one pass. With the deposit rate at zero the organic threshold decides nothing,
// and with the conversion rate at zero so does the growth law, but both still take the production value so a
// scenario that switches them on starts from the real law.
export const WATER_QUALITY_TEST_DEFAULTS: WaterQualityOptions = {
  fluxFraction: 0.5,
  dtScale: 1.0,
  decayRate: 0.0,
  soilDepositRate: 0.0,
  organicDepositThreshold: ORGANIC_DEPOSIT_THRESHOLD,
  washOffRate: 0.0,
  organicWashOffRate: 0.0,
  soilDecayRate: 0.0,
  organicDecayRate: 0.0,
  organicConversionRate: 0.0,
  growthGain: 0.0,
};

/** Velocity of one cell: the (direction * speed) pair water-velocity.frag writes into rg. */
export type VelocityTexel = readonly [number, number];

/** A substance source in the shader's world space; see createGpuWaterQuality.addPollutantSource. */
export type QualityInjectSource = {
  x: number;
  y: number;
  radius: number;
  amount: number;
  species: PollutantSpeciesId;
};

/**
 * An organic deposit in the same world space; see createGpuTerrainQuality.addOrganicDeposit. Like a pollutant source
 * it keeps releasing every pass until the caller clears it - production clears them after each pass, this model applies
 * whatever list it is handed for every pass it runs.
 */
export type OrganicDepositSource = {
  x: number;
  y: number;
  radius: number;
  amount: number;
};

/** The two compartments of one simulation step, both flat RGBA with index = (row * size + column) * 4. */
export type SubstanceFields = {
  waterMass: Float32Array;
  groundMass: Float32Array;
};

const clampUnit = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** wetness from the shaders: how much of a cell's water-borne behaviour is switched on at this depth. */
export const wetnessForDepth = (depth: number): number =>
  clampUnit(depth / WET_DEPTH, 0, 1);

/**
 * Canonical D8 step a velocity was emitted from, found the same way the shader finds it: best alignment wins,
 * ties keep the earlier table entry because the comparison is strictly greater.
 */
const routeStepFor = (velocity: VelocityTexel): [number, number] => {
  if (Math.hypot(velocity[0], velocity[1]) < EPS) {
    return [0, 0];
  }

  let bestStep: [number, number] = [0, 0];
  let bestAlignment = -1;
  for (const candidate of DIRECTION_STEPS) {
    const length = Math.max(Math.hypot(candidate[0], candidate[1]), EPS);
    const alignment =
      velocity[0] * (candidate[0] / length) +
      velocity[1] * (candidate[1] / length);
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      bestStep = [candidate[0], candidate[1]];
    }
  }
  return bestStep;
};

/**
 * Fraction of a cell's mass that leaves it in one pass, plus the step it leaves along: exportFractionAt from the
 * shader, including its refusal to export off-grid.
 */
const exportFraction = (
  column: number,
  row: number,
  size: number,
  velocity: VelocityTexel,
  options: WaterQualityOptions,
): { fraction: number; step: [number, number] } => {
  const step = routeStepFor(velocity);
  if (step[0] === 0 && step[1] === 0) {
    return { fraction: 0, step };
  }

  const targetColumn = column + step[0];
  const targetRow = row + step[1];
  if (
    targetColumn < 0 ||
    targetColumn >= size ||
    targetRow < 0 ||
    targetRow >= size
  ) {
    return { fraction: 0, step };
  }

  return {
    fraction: clampUnit(
      options.fluxFraction * options.dtScale,
      0,
      FLUX_CEILING,
    ),
    step,
  };
};

/**
 * Every leg of the hand-over for one cell: exchangeAt from both shaders. The committed values are the ones each
 * shader reads through its samplers, which is why a species only moves between compartments rather than appearing.
 * Organic matter has one leg only - the ground gives it to a film and never takes it back. Bacteria have two, and
 * the deposit is worth whatever carbon the soil is holding: no organic matter, nothing for them to settle onto.
 */
const exchangeFor = (
  depth: number,
  waterBacteria: number,
  groundBacteria: number,
  groundOrganic: number,
  options: WaterQualityOptions,
): {
  toGroundBacteria: number;
  toWaterBacteria: number;
  toWaterOrganic: number;
} => {
  const wetness = wetnessForDepth(depth);

  // How much of the deposit the soil's carbon is worth, matching the shaders' saturating ramp: nothing on clean
  // ground, the full soilDepositRate at organicDepositThreshold and above, proportional in between.
  const carbon = clampUnit(
    Math.max(groundOrganic, 0) / Math.max(options.organicDepositThreshold, EPS),
    0,
    1,
  );

  return {
    toGroundBacteria:
      Math.max(waterBacteria, 0) *
      Math.min(options.soilDepositRate * options.dtScale, EXCHANGE_CEILING) *
      wetness *
      carbon,
    toWaterBacteria:
      Math.max(groundBacteria, 0) *
      Math.min(options.washOffRate * options.dtScale, EXCHANGE_CEILING) *
      wetness,
    toWaterOrganic:
      Math.max(groundOrganic, 0) *
      Math.min(options.organicWashOffRate * options.dtScale, EXCHANGE_CEILING) *
      wetness,
  };
};

/**
 * How much of a compartment's organic matter becomes bacteria in one pass: `growthAt` from both shaders, applied
 * to whichever compartment is being stepped. This is a conversion rather than a transfer - each side spends the
 * carbon it is holding, so nothing crosses the boundary here - which is why it takes each compartment's own two
 * numbers instead of a shared committed texel.
 */
const growthFor = (
  organic: number,
  population: number,
  wetness: number,
  options: WaterQualityOptions,
): number => {
  const available = Math.max(organic, 0);

  // Same clamp as the shaders: the combined rate is bounded, and the result is a fraction of what is there, so a
  // cell can never convert more than it holds and nothing multiplies on a dry bed.
  const rate = Math.min(
    (options.organicConversionRate +
      options.growthGain * Math.max(population, 0)) *
      options.dtScale,
    GROWTH_CEILING,
  );

  return available * rate * wetness;
};

/** Texel centre in the shaders' shared world space; see water-quality.frag and terrain-quality.frag's mapping. */
const worldPositionOfTexel = (
  column: number,
  row: number,
  size: number,
  terrainSize: number,
): { worldX: number; worldY: number } => ({
  // uv comes from gl_FragCoord at the texel centre, and y is flipped into world space exactly as main() does.
  worldX: ((column + 0.5) / size) * terrainSize,
  worldY: (1 - (row + 0.5) / size) * terrainSize,
});

/** Mass one soft disc drops on a texel this pass: the falloff law both shaders share, centre strength included. */
const discEmission = (
  worldX: number,
  worldY: number,
  disc: { x: number; y: number; radius: number; amount: number },
  options: WaterQualityOptions,
): number => {
  const deltaX = worldX - disc.x;
  const deltaY = worldY - disc.y;
  const distanceSq = deltaX * deltaX + deltaY * deltaY;
  const radiusSq = disc.radius * disc.radius;
  if (distanceSq >= radiusSq) {
    return 0;
  }

  const falloff = 1 - distanceSq / radiusSq;
  return disc.amount * falloff * falloff * (3 - 2 * falloff) * options.dtScale;
};

/** Mass one source drops on a texel this pass: emissionAt from the shader, same disc and same channel mask. */
const emissionFor = (
  column: number,
  row: number,
  size: number,
  terrainSize: number,
  sources: readonly QualityInjectSource[],
  options: WaterQualityOptions,
): number[] => {
  const emitted = [0, 0, 0, 0];

  const { worldX, worldY } = worldPositionOfTexel(
    column,
    row,
    size,
    terrainSize,
  );

  for (const source of sources) {
    emitted[source.species] += discEmission(worldX, worldY, source, options);
  }

  return emitted;
};

/** Mass one pass's organic deposits drop on a texel: depositAt from terrain-quality.frag, which fills one channel. */
const depositFor = (
  column: number,
  row: number,
  size: number,
  terrainSize: number,
  deposits: readonly OrganicDepositSource[],
  options: WaterQualityOptions,
): number => {
  const { worldX, worldY } = worldPositionOfTexel(
    column,
    row,
    size,
    terrainSize,
  );

  let deposited = 0;
  for (const deposit of deposits) {
    deposited += discEmission(worldX, worldY, deposit, options);
  }

  return deposited;
};

/**
 * Advance both compartments by `passes` steps.
 *
 * @param fields - Starting water and ground mass; see SubstanceFields for the channel layout
 * @param depthByIndex - Committed water depth per texel, which drives oxygen carry and the ground exchange
 * @param velocityByIndex - Velocity per texel using the same indexing as the fields
 * @param size - Grid edge in texels
 * @param terrainSize - World edge, needed to place sources and deposits
 * @param passes - Number of compute steps to run
 * @param options - Per-pass coefficients; see WATER_QUALITY_TEST_DEFAULTS
 * @param sources - Persistent emitters applied after transport each pass
 * @param deposits - Organic deposits the ground receives after its own decay and exchange each pass
 */
export const simulateWaterQualityReference = (
  fields: SubstanceFields,
  depthByIndex: ReadonlyArray<number>,
  velocityByIndex: ReadonlyArray<VelocityTexel>,
  size: number,
  terrainSize: number,
  passes: number,
  options: WaterQualityOptions = WATER_QUALITY_TEST_DEFAULTS,
  sources: readonly QualityInjectSource[] = [],
  deposits: readonly OrganicDepositSource[] = [],
): SubstanceFields => {
  const decay = clampUnit(
    options.decayRate * options.dtScale,
    0,
    DECAY_CEILING,
  );
  const soilDecay = clampUnit(
    options.soilDecayRate * options.dtScale,
    0,
    DECAY_CEILING,
  );
  const soilOrganicDecay = clampUnit(
    options.organicDecayRate * options.dtScale,
    0,
    DECAY_CEILING,
  );

  let water = new Float32Array(fields.waterMass);
  let ground = new Float32Array(fields.groundMass);

  for (let pass = 0; pass < passes; pass++) {
    const nextWater = new Float32Array(water.length);
    const nextGround = new Float32Array(ground.length);

    // Export first: every texel knows its own fraction and route before anything is gathered, so no texel can
    // be read after it was already updated this pass.
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const index = (row * size + column) * 4;
        const ownVelocity: VelocityTexel = velocityByIndex[row * size + column];
        const own = exportFraction(column, row, size, ownVelocity, options);

        for (let channel = 0; channel < 4; channel++) {
          nextWater[index + channel] =
            water[index + channel] * (1 - own.fraction);
        }
      }
    }

    // Then gather: a neighbour contributes when its route lands here, re-evaluated on the neighbour's texel.
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const index = (row * size + column) * 4;

        for (const step of DIRECTION_STEPS) {
          const sourceColumn = column + step[0];
          const sourceRow = row + step[1];
          if (
            sourceColumn < 0 ||
            sourceColumn >= size ||
            sourceRow < 0 ||
            sourceRow >= size
          ) {
            continue;
          }

          const neighbourVelocity: VelocityTexel =
            velocityByIndex[sourceRow * size + sourceColumn];
          const neighbour = exportFraction(
            sourceColumn,
            sourceRow,
            size,
            neighbourVelocity,
            options,
          );
          if (neighbour.fraction <= 0) {
            continue;
          }

          // Negation of a table entry: the shader compares literals for exactly this reason.
          if (
            neighbour.step[0] === -step[0] &&
            neighbour.step[1] === -step[1]
          ) {
            const sourceIndex = (sourceRow * size + sourceColumn) * 4;
            for (let channel = 0; channel < 4; channel++) {
              nextWater[index + channel] +=
                water[sourceIndex + channel] * neighbour.fraction;
            }
          }
        }
      }
    }

    // Fade, oxygen carry, exchange, then emission: substance a source adds this pass cannot be exported by the
    // same pass, and - for dissolved oxygen - cannot be added to ground that has no water on it either.
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const index = (row * size + column) * 4;
        const depth = depthByIndex[row * size + column];
        const wetness = wetnessForDepth(depth);
        const exchange = exchangeFor(
          depth,
          water[index + CHANNEL_BACTERIA],
          ground[index + GROUND_CHANNEL_BACTERIA],
          ground[index + GROUND_CHANNEL_ORGANIC],
          options,
        );

        for (let channel = 0; channel < 4; channel++) {
          nextWater[index + channel] *= 1 - decay;
        }

        // Dissolved oxygen is a property of the water alone: it thins out with the film rather than being left
        // behind in dry ground the way nitrogen and organic matter are. wetness is the survival fraction for one
        // nominal pass, so dtScale belongs in the exponent - the shader's pow(wetness, dtScale) (plan S6).
        nextWater[index + CHANNEL_OXYGEN] *= Math.pow(wetness, options.dtScale);

        // Growth, taken out of the film's own organic and paid into its own bacteria. Measured on the amount left
        // after transport and fade, exactly as `growthAt` is called on `faded` in water-quality.frag.
        const converted = growthFor(
          nextWater[index + CHANNEL_ORGANIC],
          nextWater[index + CHANNEL_BACTERIA],
          wetness,
          options,
        );

        nextWater[index + CHANNEL_BACTERIA] +=
          exchange.toWaterBacteria - exchange.toGroundBacteria + converted;

        // Organic matter crosses into the film and never back out of it, so this leg is an addition here and the
        // subtraction of exactly the same number on the ground below. `converted` then shrinks the film's own
        // organic, which is what lets a plume grow without minting mass out of nothing.
        nextWater[index + CHANNEL_ORGANIC] +=
          exchange.toWaterOrganic - converted;

        const emitted = emissionFor(
          column,
          row,
          size,
          terrainSize,
          sources,
          options,
        );
        emitted[CHANNEL_OXYGEN] *= wetness;
        for (let channel = 0; channel < 4; channel++) {
          nextWater[index + channel] += emitted[channel];
        }

        // The ground's bacterial channel: die-off, the same two numbers the water column just moved, and whatever
        // the soil converted into bacteria. Read off the committed soil, so a deposit dropped this pass cannot feed
        // the population that lands with it (plan A3).
        nextGround[index + GROUND_CHANNEL_BACTERIA] =
          ground[index + GROUND_CHANNEL_BACTERIA] * (1 - soilDecay) +
          exchange.toGroundBacteria -
          exchange.toWaterBacteria +
          growthFor(
            ground[index + GROUND_CHANNEL_ORGANIC],
            ground[index + GROUND_CHANNEL_BACTERIA],
            wetness,
            options,
          );

        // The ground's organic channel: mineralisation, the wash-off the film just received, what the population
        // above converts into itself, and whatever animals dropped this pass. Deposits come last, so a pat cannot
        // be washed away by the pass that laid it (plan A3).
        nextGround[index + GROUND_CHANNEL_ORGANIC] =
          ground[index + GROUND_CHANNEL_ORGANIC] * (1 - soilOrganicDecay) -
          exchange.toWaterOrganic -
          growthFor(
            ground[index + GROUND_CHANNEL_ORGANIC],
            ground[index + GROUND_CHANNEL_BACTERIA],
            wetness,
            options,
          ) +
          depositFor(column, row, size, terrainSize, deposits, options);
      }
    }

    water = nextWater;
    ground = nextGround;
  }

  return { waterMass: water, groundMass: ground };
};

/**
 * Sum of each channel over the whole grid, for conservation assertions.
 *
 * Kahan-compensated: a plain sum drifts by more than the tolerance these tests care about once thousands of
 * texels are added up in float order.
 */
export const channelTotals = (mass: Float32Array): number[] => {
  const totals = [0, 0, 0, 0];
  const compensation = [0, 0, 0, 0];

  for (let index = 0; index < mass.length; index += 4) {
    for (let channel = 0; channel < 4; channel++) {
      const value = mass[index + channel];
      const residual = value - compensation[channel];
      const sum = totals[channel] + residual;
      compensation[channel] = sum - totals[channel] - residual;
      totals[channel] = sum;
    }
  }

  return totals;
};

/** Total bacteria across both compartments, which is the quantity a pass may only move and not destroy. */
export const totalBacteria = (fields: SubstanceFields): number =>
  totalAcrossCompartments(fields, CHANNEL_BACTERIA, GROUND_CHANNEL_BACTERIA);

/**
 * Total organic matter across both compartments: what the animals dropped on the land plus what a stream is carrying.
 * Exchange moves it between those two, and growth spends it on bacteria - so the invariant to hold across a pass is
 * this plus `totalBacteria`, not either number alone.
 */
export const totalOrganicMatter = (fields: SubstanceFields): number =>
  totalAcrossCompartments(fields, CHANNEL_ORGANIC, GROUND_CHANNEL_ORGANIC);

/**
 * Organic matter plus bacteria across both compartments: the quantity that only changes when decay removes some,
 * since every conversion just moves mass from one of these channels into the other.
 */
export const totalBacteriaAndOrganic = (fields: SubstanceFields): number =>
  totalBacteria(fields) + totalOrganicMatter(fields);

/** Kahan-compensated sum of one water channel and its ground partner over the whole grid. */
const totalAcrossCompartments = (
  fields: SubstanceFields,
  waterChannel: number,
  groundChannel: number,
): number => {
  let total = 0;
  let compensation = 0;

  for (let index = 0; index < fields.groundMass.length; index += 4) {
    const value =
      fields.waterMass[index + waterChannel] +
      fields.groundMass[index + groundChannel];
    const residual = value - compensation;
    const sum = total + residual;
    compensation = sum - total - residual;
    total = sum;
  }

  return total;
};
