/**
 * Deterministic, dependency-free procedural noise for terrain generation.
 *
 * Everything here is a pure function of its inputs: the same coordinates and
 * field settings always produce the same value on every platform, which keeps
 * generated terrain reproducible across reloads, saves and CPU/GPU parity tests.
 *
 * The generator is gradient-free lattice (value) noise: integer lattice corners
 * are hashed to values in [-1, 1] and interpolated with a quintic fade curve.
 * That fade is C2 continuous, so heightfields built from it keep finite,
 * well-behaved first derivatives - important because the water simulation reads
 * terrain slope with finite differences.
 */

/** Largest value an unsigned 32-bit integer can hold, used to normalise bits. */
const MAX_UNSIGNED_32_BITS = 4294967295;

/** Odd multipliers that spread lattice coordinates through the bit mixer. */
const LATTICE_MULTIPLIER_X = 0x27d4eb2d;
const LATTICE_MULTIPLIER_Y = 0x165667b1;
const SEED_MULTIPLIER = 0x9e3779b1;

/** Murmur3-style bit finaliser: avalanches every input bit across the output. */
const mixBits = (bits: number): number => {
  const afterFirstRound =
    Math.imul((bits ^ (bits >>> 16)) >>> 0, 0x7feb352d) >>> 0;
  return (
    Math.imul(afterFirstRound ^ (afterFirstRound >>> 15), 0x846ca68b) >>> 0
  );
};

/** Map raw bits onto the unit interval [0, 1]. */
const unitRangeFromBits = (bits: number): number => bits / MAX_UNSIGNED_32_BITS;

/** Mix one lattice column into a key that corner hashing can fold rows into. */
const mixedColumnKey = (cellX: number): number =>
  mixBits(Math.imul(cellX | 0, LATTICE_MULTIPLIER_X));

/** Mix one lattice row and the seed into a key that corner hashing folds columns into. */
const mixedRowKey = (cellY: number, seed: number): number =>
  mixBits(
    Math.imul(cellY | 0, LATTICE_MULTIPLIER_Y) ^
      Math.imul(seed | 0, SEED_MULTIPLIER),
  );

/**
 * Pseudo-random value in [-1, 1] for one lattice corner.
 *
 * Column and row keys are mixed once per noise sample (see latticeNoise2d) and
 * folded together here with a final avalanche, which stops rows and columns from
 * lining up into the visible streaks a naive `x * a + y * b` hash produces.
 */
const cornerNoiseFromMixedKeys = (
  mixedColumn: number,
  mixedRow: number,
): number => unitRangeFromBits(mixBits((mixedColumn + mixedRow) | 0)) * 2 - 1;

/** Quintic fade curve: C2 continuous, so octave sums never show faceted creases. */
const interpolateWeight = (fractionalCoordinate: number): number => {
  const t = fractionalCoordinate;
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const mixValues = (
  fromValue: number,
  toValue: number,
  weight: number,
): number => fromValue + (toValue - fromValue) * weight;

/**
 * Re-map a value that only occupies part of its nominal range onto the full
 * [0, 1] interval, clamped at both ends.
 *
 * Octave averaging pulls fractal noise toward its mean: an fBm sample is rarely
 * near +/-1 and a ridged sum rarely near 0 or 1. Feeding such a compressed signal
 * straight into amplitudes wastes most of the height budget and yields flat
 * terrain with a few spikes, so callers stretch it back out first with edges
 * measured from the field they are about to build.
 */
export const stretchToUnitRange = (
  noiseValue: number,
  lowEdge: number,
  highEdge: number,
): number => {
  const stretched = (noiseValue - lowEdge) / (highEdge - lowEdge);
  return Math.max(0, Math.min(1, stretched));
};

/**
 * Lattice noise sampled at an arbitrary point, in [-1, 1].
 */
export const latticeNoise2d = (x: number, y: number, seed = 0): number => {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);

  const westKey = mixedColumnKey(cellX);
  const eastKey = mixedColumnKey(cellX + 1);
  const southKey = mixedRowKey(cellY, seed);
  const northKey = mixedRowKey(cellY + 1, seed);

  const weightX = interpolateWeight(x - cellX);
  const weightY = interpolateWeight(y - cellY);

  const southEdge = mixValues(
    cornerNoiseFromMixedKeys(westKey, southKey),
    cornerNoiseFromMixedKeys(eastKey, southKey),
    weightX,
  );
  const northEdge = mixValues(
    cornerNoiseFromMixedKeys(westKey, northKey),
    cornerNoiseFromMixedKeys(eastKey, northKey),
    weightX,
  );

  return mixValues(southEdge, northEdge, weightY);
};

/**
 * Octave layout for a fractal noise field. Pass one stable object (a module-level
 * constant) rather than rebuilding it per sample: the derived ladder is memoised
 * against this identity, which keeps the per-sample path allocation-free.
 */
export type FractalNoiseField = {
  /** Number of detail layers to stack. */
  octaves: number;
  /** Cycles per world unit for the widest layer. */
  baseFrequency: number;
  seed?: number;
  /** Frequency multiplier applied per octave, conventionally 2. */
  lacunarity?: number;
  /** Amplitude multiplier applied per octave, conventionally 0.5. */
  persistence?: number;
};

type OctaveLadder = {
  frequencies: number[];
  weights: number[];
  totalWeight: number;
};

/**
 * Per-octave frequency and weight, normalised so an octave sum stays in [-1, 1]
 * whatever the octave count. Memoised on field identity because terrain sampling
 * runs millions of times per load and this never changes for a constant field.
 */
const octaveLadders = new WeakMap<FractalNoiseField, OctaveLadder>();

const buildOctaveLadder = (field: FractalNoiseField): OctaveLadder => {
  const lacunarity = field.lacunarity ?? 2;
  const persistence = field.persistence ?? 0.5;
  const octaveCount = Math.max(1, field.octaves);

  const frequencies: number[] = [];
  const weights: number[] = [];
  let totalWeight = 0;

  // Hot path: local accumulators instead of an allocating fold over a layer array.
  for (let index = 0; index < octaveCount; index++) {
    frequencies.push(field.baseFrequency * Math.pow(lacunarity, index));
    const weight = Math.pow(persistence, index);
    weights.push(weight);
    totalWeight += weight;
  }

  return { frequencies, weights, totalWeight };
};

const resolveOctaveLadder = (field: FractalNoiseField): OctaveLadder => {
  const cached = octaveLadders.get(field);
  if (cached !== undefined) {
    return cached;
  }

  const ladder = buildOctaveLadder(field);
  octaveLadders.set(field, ladder);
  return ladder;
};

/** Weighted sum over the ladder; `shape` maps one octave sample to [0-ish, 1-ish]. */
const sumOverOctaves = (
  x: number,
  y: number,
  field: FractalNoiseField,
  shape: (noiseValue: number) => number,
): number => {
  const ladder = resolveOctaveLadder(field);
  const seed = field.seed ?? 0;

  let sum = 0;

  for (let index = 0; index < ladder.frequencies.length; index++) {
    sum +=
      ladder.weights[index] *
      shape(
        latticeNoise2d(
          x * ladder.frequencies[index],
          y * ladder.frequencies[index],
          seed,
        ),
      );
  }

  return sum / ladder.totalWeight;
};

/**
 * Fractal Brownian motion: octaves of lattice noise summed into cloud-like rolling
 * relief. Result stays in [-1, 1].
 */
export const fbmNoise2d = (
  x: number,
  y: number,
  field: FractalNoiseField,
): number => sumOverOctaves(x, y, field, (noiseValue) => noiseValue);

/**
 * Ridged multifractal: octaves of `1 - |noise|`, squared to sharpen crests and leave
 * steep-sided valleys between them. This is what reads as "rugged" - fBm alone only
 * ever produces rolling hills. Result stays in [0, 1].
 */
export const ridgedMultifractal2d = (
  x: number,
  y: number,
  field: FractalNoiseField,
): number =>
  sumOverOctaves(x, y, field, (noiseValue) => {
    const ridge = 1 - Math.abs(noiseValue);
    return ridge * ridge;
  });
