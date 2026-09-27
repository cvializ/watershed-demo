import { expect, test } from "@playwright/test";
import { createTerrainGeometry } from "src/scene/resources/meshes/terrain";
import { calculateHeight } from "src/terrainUtils";

const TERRAIN_SIZE = 12;
const HALF_SIZE = TERRAIN_SIZE / 2;

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

test.describe("Wissahickon DEM terrain", () => {
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

  test("stays within the scene vertical envelope", () => {
    // Heights are mapped into the frame the scene was lit around, so no vertex
    // pokes far above or below the datums the camera and water expect.
    for (const height of sampleGrid(80)) {
      expect(height).toBeGreaterThanOrEqual(-0.5 - 1e-6);
      expect(height).toBeLessThanOrEqual(1.3 + 1e-6);
    }
  });

  test("has real relief rather than a flat board", () => {
    const values = sampleGrid(120);
    const lowest = percentileOf(values, 0.02);
    const highest = percentileOf(values, 0.98);
    // A genuine creek-and-ridge landscape spans well over half the vertical range.
    expect(highest - lowest).toBeGreaterThan(1);

    const firstQuartile = percentileOf(values, 0.25);
    const thirdQuartile = percentileOf(values, 0.75);
    // Roughness is spread across the catchment, not a couple of spikes.
    expect(thirdQuartile - firstQuartile).toBeGreaterThan(0.3);
  });

  test("builds a terrain mesh whose vertices sample the real DEM", () => {
    const geometry = createTerrainGeometry();
    const positions = geometry.attributes.position;

    // Geometry is displaced by calculateHeight, so every vertex must match it
    // (this guards against the mesh drifting off the committed data).
    let mismatches = 0;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      if (Math.abs(positions.getZ(index) - calculateHeight(x, y)) > 1e-6) {
        mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });
});
