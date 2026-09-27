import { expect, test } from "@playwright/test";
import { createTerrainGeometry } from "src/scene/resources/meshes/terrain";
import { cobbsCreek } from "src/terrain/cobbsCreekHeightField";
import { TERRAIN_HALF_SIZE, TERRAIN_SIZE } from "src/terrain/constants";
import { calculateHeight } from "src/terrainUtils";

type HeightSample = { x: number; y: number };

type Coordinate = { longitude: number; latitude: number };

const sampleGrid = (steps: number): number[] => {
  const values: number[] = [];

  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const position: HeightSample = {
        x: -TERRAIN_HALF_SIZE + (column / (steps - 1)) * TERRAIN_SIZE,
        y: -TERRAIN_HALF_SIZE + (row / (steps - 1)) * TERRAIN_SIZE,
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

/**
 * Map a real-world coordinate onto the terrain mesh: the DEM grid covers the
 * whole -20..+20 span, with column 0 at the western edge and row 0 at the
 * northern edge.
 */
const worldPositionFor = (coordinate: Coordinate): HeightSample => {
  const { west, east, north, south } = cobbsCreek.bounds;
  return {
    x:
      ((coordinate.longitude - west) / (east - west)) * TERRAIN_SIZE -
      TERRAIN_HALF_SIZE,
    y:
      ((north - coordinate.latitude) / (north - south)) * TERRAIN_SIZE -
      TERRAIN_HALF_SIZE,
  };
};

const heightAt = (coordinate: Coordinate): number => {
  const position = worldPositionFor(coordinate);
  return calculateHeight(position.x, position.y);
};

/**
 * Sample elevations along a west-east line of latitude so the tests can talk
 * about the lowest ground on a traverse, instead of trusting that a single
 * coordinate lands exactly in the channel (grid cells are about 12 m wide,
 * while Cobbs Creek is narrower than one cell in places).
 */
const traverse = (
  latitude: number,
  fromLongitude: number,
  toLongitude: number,
  steps: number,
): { longitude: number; height: number }[] => {
  const samples: { longitude: number; height: number }[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const longitude =
      fromLongitude + ((toLongitude - fromLongitude) * step) / steps;
    samples.push({ longitude, height: heightAt({ longitude, latitude }) });
  }

  return samples;
};

const lowestOn = (
  samples: { longitude: number; height: number }[],
): { longitude: number; height: number } =>
  samples.reduce(
    (lowest, sample) => (sample.height < lowest.height ? sample : lowest),
    samples[0],
  );

/** Real coordinates taken from OpenStreetMap and the creek's published profile. */
const CEDAR_PARK_CENTRE: Coordinate = {
  longitude: -75.2225,
  latitude: 39.9482,
};
/**
 * Crossings straight out of Cedar Park - west to the Cobbs Creek valley and
 * east toward the Schuylkill - measured against the ground under the
 * neighbourhood itself at the same latitude.
 */
const DIVIDE_CROSSINGS: {
  label: string;
  latitude: number;
}[] = [
  { label: "opposite Cedar Park", latitude: 39.9482 },
  { label: "south-west of Cedar Park", latitude: 39.9307 },
];

test.describe("Cobbs Creek DEM terrain (centred on Cedar Park)", () => {
  test("is deterministic and finite everywhere on the plane", () => {
    for (const [x, y] of [
      [0, 0],
      [-TERRAIN_HALF_SIZE, -TERRAIN_HALF_SIZE],
      [TERRAIN_HALF_SIZE, TERRAIN_HALF_SIZE],
      [3.21, -1.74],
      [-19.99, 0.03],
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

  test("sits on the ridge between the Cobbs Creek and Schuylkill valleys", () => {
    // Cedar Park sits on the drainage divide between the Cobbs Creek valley
    // and the Schuylkill, so crossing out of the neighbourhood in either
    // direction has to reach ground well below the ridge it stands on.
    const { west, east } = cobbsCreek.bounds;

    for (const crossing of DIVIDE_CROSSINGS) {
      const ridge = heightAt({
        latitude: crossing.latitude,
        longitude: CEDAR_PARK_CENTRE.longitude,
      });
      const toCobbsCreek = lowestOn(
        traverse(crossing.latitude, west, CEDAR_PARK_CENTRE.longitude, 40),
      );
      const toSchuylkill = lowestOn(
        traverse(crossing.latitude, CEDAR_PARK_CENTRE.longitude, east, 40),
      );

      // The Cobbs Creek side is the western one, and both sides drop.
      expect(toCobbsCreek.longitude).toBeLessThan(CEDAR_PARK_CENTRE.longitude);
      expect(toCobbsCreek.height).toBeLessThan(ridge - 0.3);
      expect(toSchuylkill.height).toBeLessThan(ridge - 0.3);
    }
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
