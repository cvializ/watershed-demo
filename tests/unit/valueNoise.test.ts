import { expect, test } from "@playwright/test";
import {
  fbmNoise2d,
  latticeNoise2d,
  ridgedMultifractal2d,
  stretchToUnitRange,
} from "src/utils/valueNoise";

const CONTINENTAL_FIELD = { octaves: 4, baseFrequency: 0.16, seed: 59 };
const RIDGE_FIELD = {
  octaves: 5,
  baseFrequency: 0.21,
  persistence: 0.5,
  seed: 101,
};

/** Sweep a square region of the noise field. */
const sweepField = (
  sample: (x: number, y: number) => number,
  size = 12,
  steps = 64,
) => {
  const values: number[] = [];
  const halfSize = size / 2;

  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      values.push(
        sample(
          -halfSize + (column / (steps - 1)) * size,
          -halfSize + (row / (steps - 1)) * size,
        ),
      );
    }
  }

  return values;
};

const meanOf = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviationOf = (values: number[]): number => {
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) ** 2)));
};

test.describe("latticeNoise2d", () => {
  test("is deterministic and stays inside [-1, 1]", () => {
    for (let row = 0; row < 40; row++) {
      for (let column = 0; column < 40; column++) {
        const x = column * 0.37 - 5;
        const y = row * 0.41 - 5;
        const first = latticeNoise2d(x, y, 5);
        expect(latticeNoise2d(x, y, 5)).toBe(first);
        expect(first).toBeGreaterThanOrEqual(-1);
        expect(first).toBeLessThanOrEqual(1);
      }
    }
  });

  test("is unbiased over a wide area", () => {
    const values = sweepField((x, y) => latticeNoise2d(x, y, 5), 40);
    expect(Math.abs(meanOf(values))).toBeLessThan(0.12);
    // Lattice noise spans [-1, 1] but spends most of its range between corners.
    expect(standardDeviationOf(values)).toBeGreaterThan(0.35);
  });

  test("changes with the seed", () => {
    const valuesForSeedOne = sweepField((x, y) => latticeNoise2d(x, y, 1), 8);
    const valuesForSeedTwo = sweepField((x, y) => latticeNoise2d(x, y, 2), 8);
    expect(valuesForSeedOne).not.toEqual(valuesForSeedTwo);
  });

  test("is continuous: neighbouring samples are close", () => {
    for (let row = 0; row < 25; row++) {
      for (let column = 0; column < 25; column++) {
        const x = column * 0.31 - 3;
        const y = row * 0.27 - 3;
        expect(
          Math.abs(latticeNoise2d(x, y, 9) - latticeNoise2d(x + 1e-6, y, 9)),
        ).toBeLessThan(1e-3);
      }
    }
  });

  test("has no directional bias in its correlation", () => {
    // A badly mixed lattice hash shows up as one axis or the diagonals being
    // smoother than the others; a rugged terrain must not care which way it runs.
    const steps = 128;
    const scale = 1 / 7;
    const grid: number[][] = [];

    for (let row = 0; row < steps; row++) {
      const line: number[] = [];
      for (let column = 0; column < steps; column++) {
        line.push(latticeNoise2d(column * scale, row * scale, 17));
      }
      grid.push(line);
    }

    const values = grid.flat();
    const mean = meanOf(values);
    const variance = meanOf(values.map((value) => (value - mean) ** 2));

    const correlationAt = (offsetX: number, offsetY: number): number => {
      let sum = 0;
      let count = 0;

      for (let row = 0; row < steps; row++) {
        const otherRow = row + offsetY;
        if (otherRow < 0 || otherRow >= steps) {
          continue;
        }
        for (let column = 0; column + offsetX < steps; column++) {
          sum +=
            (grid[row][column] - mean) *
            (grid[otherRow][column + offsetX] - mean);
          count++;
        }
      }

      return sum / count / variance;
    };

    const correlationAlongX = correlationAt(1, 0);
    expect(correlationAlongX).toBeGreaterThan(0.8);
    expect(Math.abs(correlationAt(0, 1) - correlationAlongX)).toBeLessThan(
      0.05,
    );
    // The diagonal must decorrelate a little faster than an axis step, never slower
    // by much: that asymmetry is what streaky hashing looks like.
    expect(correlationAt(1, 1)).toBeGreaterThan(0.82);
  });
});

test.describe("stretchToUnitRange", () => {
  test("maps the edges onto [0, 1] and clamps outside them", () => {
    expect(stretchToUnitRange(0.3, 0.3, 0.9)).toBe(0);
    expect(stretchToUnitRange(0.9, 0.3, 0.9)).toBe(1);
    expect(stretchToUnitRange(0.6, 0.3, 0.9)).toBeCloseTo(0.5, 5);
    expect(stretchToUnitRange(-4, 0.3, 0.9)).toBe(0);
    expect(stretchToUnitRange(42, 0.3, 0.9)).toBe(1);
  });
});

test.describe("fbmNoise2d", () => {
  test("stays inside [-1, 1] whatever the octave count", () => {
    for (const octaves of [1, 4, 8]) {
      const values = sweepField(
        (x, y) => fbmNoise2d(x, y, { ...CONTINENTAL_FIELD, octaves }),
        30,
      );

      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test("is unbiased and actually varies across the plane", () => {
    const values = sweepField(
      (x, y) => fbmNoise2d(x, y, CONTINENTAL_FIELD),
      30,
    );
    expect(Math.abs(meanOf(values))).toBeLessThan(0.15);
    // Octave averaging compresses the distribution toward the mean; terrainUtils
    // stretches it back out again with applyNoiseGain.
    const spread = standardDeviationOf(values);
    expect(spread).toBeGreaterThan(0.12);
    expect(spread).toBeLessThan(0.45);
  });

  test("adds detail as octaves increase", () => {
    // Count turning points along scan lines. Extra octaves carry little amplitude, so
    // they barely change height over one step yet they are exactly what makes a surface
    // wiggle: one octave is a single long swell, every added octave brings more crests
    // and hollows.
    const turningPointsAlong = (octaves: number): number => {
      const field = { ...CONTINENTAL_FIELD, octaves };
      const stepSize = 0.01;
      let turningPoints = 0;

      for (const scanLineY of [1.37, -4.2, 8.9]) {
        let previousSlopeSign = 0;

        for (let index = 0; index < 1600; index++) {
          const x = -12 + index * stepSize;
          const slope =
            fbmNoise2d(x + stepSize, scanLineY, field) -
            fbmNoise2d(x, scanLineY, field);
          const slopeSign = Math.sign(slope);

          if (
            slopeSign !== 0 &&
            previousSlopeSign !== 0 &&
            slopeSign !== previousSlopeSign
          ) {
            turningPoints++;
          }
          if (slopeSign !== 0) {
            previousSlopeSign = slopeSign;
          }
        }
      }

      return turningPoints;
    };

    const oneOctaveTurningPoints = turningPointsAlong(1);
    const fourOctaveTurningPoints = turningPointsAlong(4);
    const sixOctaveTurningPoints = turningPointsAlong(6);

    expect(fourOctaveTurningPoints).toBeGreaterThan(oneOctaveTurningPoints * 3);
    expect(sixOctaveTurningPoints).toBeGreaterThan(
      fourOctaveTurningPoints * 1.5,
    );
  });
});

test.describe("ridgedMultifractal2d", () => {
  test("stays inside [0, 1] and keeps sharp crests", () => {
    const values = sweepField(
      (x, y) => ridgedMultifractal2d(x, y, RIDGE_FIELD),
      30,
    );

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    // Ridge height is dominated by smoothed lattice noise spending most of its time
    // near zero, which puts the octave average around 0.45-0.55; if normalisation ever
    // drifted with the octave count this band would move.
    const meanRidge = meanOf(values);
    expect(meanRidge).toBeGreaterThan(0.35);
    expect(meanRidge).toBeLessThan(0.7);

    const sorted = [...values].sort((first, second) => first - second);
    const highest = sorted[sorted.length - 1];
    const lowest = sorted[0];
    // Crests and valleys both exist, otherwise the field is a flat plate.
    expect(highest - lowest).toBeGreaterThan(0.5);
  });

  test("reaches full crest height somewhere on the plane", () => {
    // Rugged terrain needs real crests, not just a mush of mid-height bumps: some part
    // of the field has to come close to the 1.0 ceiling.
    const ridged = sweepField(
      (x, y) => ridgedMultifractal2d(x, y, RIDGE_FIELD),
      12,
    );
    expect(Math.max(...ridged)).toBeGreaterThan(0.75);
  });
});
