import { expect, test } from "@playwright/test";
import { calculateHeight } from "src/terrainUtils";

const TERRAIN_SIZE = 12;
const HALF_SIZE = TERRAIN_SIZE / 2;
/** Vertex spacing of the terrain mesh (80 segments across a 12 unit plane). */
const MESH_STEP = TERRAIN_SIZE / 80;
/** Valley datum the scene is framed and lit around. */
const VALLEY_DATUM = -0.5;

type HeightSample = { x: number; y: number };

const sampleGrid = (steps: number): number[] => {
  const values: number[] = [];

  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const position: HeightSample = {
        x: -HALF_SIZE + (column / (steps - 1)) * TERRAIN_SIZE,
        y: -HALF_SIZE + (row / (steps - 1)) * TERRAIN_SIZE,
      };
      values.push(calculateHeight(position.x, position.y));
    }
  }

  return values;
};

const percentileOf = (values: number[], percentile: number): number => {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(percentile * (sorted.length - 1))];
};

/** Steepest gradient of the analytic field measured at mesh spacing. */
const steepestMeshGradient = (): number => {
  let steepest = 0;
  const steps = 80;

  for (let row = 1; row < steps; row++) {
    for (let column = 1; column < steps; column++) {
      const x = -HALF_SIZE + column * MESH_STEP;
      const y = -HALF_SIZE + row * MESH_STEP;
      const gradientX =
        (calculateHeight(x + MESH_STEP, y) -
          calculateHeight(x - MESH_STEP, y)) /
        (2 * MESH_STEP);
      const gradientY =
        (calculateHeight(x, y + MESH_STEP) -
          calculateHeight(x, y - MESH_STEP)) /
        (2 * MESH_STEP);
      steepest = Math.max(steepest, Math.hypot(gradientX, gradientY));
    }
  }

  return steepest;
};

test.describe("calculateHeight ruggedness", () => {
  test("is deterministic and finite everywhere on the plane", () => {
    for (const [x, y] of [
      [0, 0],
      [-HALF_SIZE, -HALF_SIZE],
      [HALF_SIZE, HALF_SIZE],
      [3.21, -1.74],
      [-5.99, 0.03],
    ]) {
      const height = calculateHeight(x, y);
      expect(Number.isFinite(height)).toBe(true);
      expect(calculateHeight(x, y)).toBe(height);
    }
  });

  test("produces rugged relief across the terrain", () => {
    const values = sampleGrid(120);
    const lowest = percentileOf(values, 0.02);
    const highest = percentileOf(values, 0.98);

    // The old flat-slope field managed about 0.3 units of total relief; rugged
    // terrain must span several times the mesh cell height so ranges read as rock.
    expect(highest - lowest).toBeGreaterThan(1.8);
  });

  test("keeps most of the plane rough rather than flat", () => {
    const values = sampleGrid(120);
    const firstQuartile = percentileOf(values, 0.25);
    const thirdQuartile = percentileOf(values, 0.75);

    // A wide interquartile band means roughness is spread over the map instead of
    // being a handful of spikes above a dead-flat floor.
    expect(thirdQuartile - firstQuartile).toBeGreaterThan(0.45);
  });

  test("keeps the median near the valley datum it was framed for", () => {
    const median = percentileOf(sampleGrid(120), 0.5);
    expect(Math.abs(median - VALLEY_DATUM)).toBeLessThan(0.25);
  });

  test("peaks rise above the waterline while valleys stay below it", () => {
    const values = sampleGrid(120);
    expect(percentileOf(values, 0.98)).toBeGreaterThan(0.1);
    expect(percentileOf(values, 0.05)).toBeLessThan(-0.9);
  });

  test("is steep in places but never vertical or overhanging", () => {
    const steepest = steepestMeshGradient();
    // Steep enough to erode dramatically (about 45-65 degrees at the sharpest crest)
    // yet bounded, so the heightfield stays single-valued and the water simulation's
    // finite differences keep a sane slope.
    expect(steepest).toBeGreaterThan(1);
    expect(steepest).toBeLessThan(3.2);
  });

  test("varies between neighbouring mesh vertices", () => {
    let identicalNeighbours = 0;
    const steps = 60;
    const stepSize = TERRAIN_SIZE / (steps - 1);

    for (let row = 0; row < steps; row++) {
      for (let column = 0; column + 1 < steps; column++) {
        const x = -HALF_SIZE + column * stepSize;
        const y = -HALF_SIZE + row * stepSize;
        if (calculateHeight(x, y) === calculateHeight(x + stepSize, y)) {
          identicalNeighbours++;
        }
      }
    }

    expect(identicalNeighbours).toBe(0);
  });
});
