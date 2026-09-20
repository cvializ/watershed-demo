/**
 * CPU reference for `src/shaders/compute/water-quality.frag`.
 *
 * This mirrors the shader's arithmetic channel by channel so the GPU test can compare whole textures against a
 * model instead of hand-derived expectations, which is what catches a future edit to one side drifting from the
 * other. It follows the shader deliberately - including its quirks: transport authority is the velocity field,
 * water depth plays no part; export fractions are recomputed per texel; and border cells keep their load rather
 * than leaking it off-grid. Where the two must stay in step the shader is cited by section.
 *
 * Channels hold column-integrated mass, exactly as in the texture: index 0 nitrogen, 1 organic matter,
 * 2 dissolved oxygen, 3 bacteria.
 */

// Channel ids come from the production module so this model cannot drift out of its layout (plan: channels are
// load-bearing, not colours).
import type { PollutantSpeciesId } from "@/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts";

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

// The shader clamps both coefficients; the reference has to clamp identically or a stress case would disagree.
const FLUX_CEILING = 0.75;
const DECAY_CEILING = 0.25;

/** Per-pass coefficients, matching the uniforms createGpuWaterQuality writes. */
export type WaterQualityOptions = {
  fluxFraction: number;
  dtScale: number;
  decayRate: number;
};

// The conservation harness wants a pure transport step, so decay defaults to off and dtScale to one pass.
export const WATER_QUALITY_TEST_DEFAULTS: WaterQualityOptions = {
  fluxFraction: 0.5,
  dtScale: 1.0,
  decayRate: 0.0,
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

const clampUnit = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

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

  // uv comes from gl_FragCoord at the texel centre, and y is flipped into world space exactly as main() does.
  const worldX = ((column + 0.5) / size) * terrainSize;
  const worldY = (1 - (row + 0.5) / size) * terrainSize;

  for (const source of sources) {
    const deltaX = worldX - source.x;
    const deltaY = worldY - source.y;
    const distanceSq = deltaX * deltaX + deltaY * deltaY;
    const radiusSq = source.radius * source.radius;
    if (distanceSq >= radiusSq) {
      continue;
    }

    const falloff = 1 - distanceSq / radiusSq;
    emitted[source.species] +=
      source.amount * falloff * falloff * (3 - 2 * falloff) * options.dtScale;
  }

  return emitted;
};

/**
 * Advance the substance field by `passes` steps.
 *
 * @param mass - Flat RGBA mass, one row per `size` texels, index = (row * size + column) * 4
 * @param velocityByIndex - Velocity per texel using the same indexing as `mass`
 * @param size - Grid edge in texels
 * @param terrainSize - World edge, needed to place sources
 * @param passes - Number of compute steps to run
 * @param options - Per-pass coefficients; see WATER_QUALITY_TEST_DEFAULTS
 * @param sources - Persistent emitters applied after transport each pass
 */
export const simulateWaterQualityReference = (
  mass: Float32Array,
  velocityByIndex: ReadonlyArray<VelocityTexel>,
  size: number,
  terrainSize: number,
  passes: number,
  options: WaterQualityOptions = WATER_QUALITY_TEST_DEFAULTS,
  sources: readonly QualityInjectSource[] = [],
): Float32Array => {
  const decay = clampUnit(
    options.decayRate * options.dtScale,
    0,
    DECAY_CEILING,
  );

  let current = new Float32Array(mass);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(current.length);

    // Export first: every texel knows its own fraction and route before anything is gathered, so no texel can
    // be read after it was already updated this pass.
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const index = (row * size + column) * 4;
        const ownVelocity: VelocityTexel = velocityByIndex[row * size + column];
        const own = exportFraction(column, row, size, ownVelocity, options);

        for (let channel = 0; channel < 4; channel++) {
          next[index + channel] = current[index + channel] * (1 - own.fraction);
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
              next[index + channel] +=
                current[sourceIndex + channel] * neighbour.fraction;
            }
          }
        }
      }
    }

    // Decay, then emission: substance a source adds this pass cannot be exported by the same pass.
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const index = (row * size + column) * 4;
        const emitted = emissionFor(
          column,
          row,
          size,
          terrainSize,
          sources,
          options,
        );
        for (let channel = 0; channel < 4; channel++) {
          next[index + channel] =
            next[index + channel] * (1 - decay) + emitted[channel];
        }
      }
    }

    current = next;
  }

  return current;
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
