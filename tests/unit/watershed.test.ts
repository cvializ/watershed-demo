import { expect, test } from "@playwright/test";
import * as THREE from "three";

import {
  computeFlowDirections,
  computeWatershed,
} from "src/terrain/computeWatershed";
import {
  buildHeightGrid,
  getCellIndexAtLocal,
  getCellIndexAtWorld,
} from "src/terrain/terrainHeightGrid";
import {
  createTerrainGeometry,
  TERRAIN_MESH_SEGMENTS,
} from "src/scene/resources/meshes/terrain";

/** Read a row-major grid as a plain array for easy assertion. */
const grid = (heights: Float32Array | Uint8Array): number[] =>
  Array.from(heights);

test.describe("computeFlowDirections", () => {
  test("a corner-to-corner slope points every cell toward the low corner", () => {
    // 3×3 where height = row + col, so water always seeks (0,0).
    const heights = new Float32Array([
      0, 1, 2, //
      1, 2, 3, //
      2, 3, 4, //
    ]);

    const flow = computeFlowDirections(heights, 3);

    // The lowest cell is a sink with no downstream.
    expect(flow[0]).toBe(-1);
    // Every other cell drains strictly downhill (some directly to 0).
    for (let i = 1; i < heights.length; i++) {
      expect(flow[i]).toBeGreaterThanOrEqual(0);
      expect(heights[flow[i]]).toBeLessThan(heights[i]);
    }
  });

  test("a local minimum is a sink", () => {
    // Centre is lowest, ring is higher: the centre has no lower neighbour.
    const heights = new Float32Array([
      5, 5, 5, //
      5, 1, 5, //
      5, 5, 5, //
    ]);

    const flow = computeFlowDirections(heights, 3);
    expect(flow[4]).toBe(-1); // centre sink
  });
});

test.describe("computeWatershed", () => {
  test("pouring at the funnel low catches the whole grid", () => {
    const heights = new Float32Array([
      0, 1, 2, //
      1, 2, 3, //
      2, 3, 4, //
    ]);

    const mask = computeWatershed(heights, 3, 0);
    expect(grid(mask)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("pouring at the highest corner catches only that cell", () => {
    const heights = new Float32Array([
      0, 1, 2, //
      1, 2, 3, //
      2, 3, 4, //
    ]);

    // Cell 8 (row 2, col 2) is the peak; nothing drains into it.
    const mask = computeWatershed(heights, 3, 8);
    expect(grid(mask)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  test("a diagonal chain of contributors is traced back correctly", () => {
    // Same slope: cell 3 (row1,col0) is fed by cells 6 (row2,col0) and
    // 7 (row2,col1), and nothing else reaches it.
    const heights = new Float32Array([
      0, 1, 2, //
      1, 2, 3, //
      2, 3, 4, //
    ]);

    const mask = computeWatershed(heights, 3, 3);
    expect(grid(mask)).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
  });

  test("mask length matches the grid", () => {
    const heights = new Float32Array([0, 1, 2, 3]);
    const mask = computeWatershed(heights, 2, 0);
    expect(mask.length).toBe(4);
  });
});

test.describe("buildHeightGrid / cell mapping", () => {
  test("the real terrain geometry yields a 161×161 row-major grid", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry);
    expect(built).not.toBeNull();

    const gridDim = TERRAIN_MESH_SEGMENTS + 1;
    expect(built!.gridDim).toBe(gridDim);

    // heights are copied straight from the geometry's local Z, so grid index
    // equals vertex index — verify that holds end to end.
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(built!.heights[0]).toBeCloseTo(position.getZ(0), 5);
    expect(built!.heights[built!.heights.length - 1]).toBeCloseTo(
      position.getZ(position.count - 1),
      5,
    );
  });

  test("cell indices clamp out-of-range and hit edge cells", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;

    // Local coords are -20..20 for a 40-unit terrain; a far-out point clamps.
    const far = getCellIndexAtLocal(built, 1_000, 1_000);
    const maxCell = (TERRAIN_MESH_SEGMENTS + 1) * (TERRAIN_MESH_SEGMENTS + 1);
    expect(far).toBeLessThan(maxCell);

    // Top-left local corner (minX, maxY) is cell 0 → row 0, col 0.
    expect(getCellIndexAtLocal(built, built.minX, built.maxY)).toBe(0);

    // Bottom-right local corner (maxX, minY) is the last cell.
    expect(getCellIndexAtLocal(built, built.maxX, built.minY)).toBe(
      maxCell - 1,
    );
  });

  test("world→cell mirrors the local mapping (world z = -local y)", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;

    // A point at local (x, y) sits at world (x, -y) for the rotated plane.
    const localX = 3.2;
    const localY = -1.7;
    expect(getCellIndexAtWorld(built, localX, -localY)).toBe(
      getCellIndexAtLocal(built, localX, localY),
    );
  });

  test("non-square geometry returns null", () => {
    const geometry = createTerrainGeometry();
    // Trim to a non-square vertex count so the grid can't be a square.
    geometry.setDrawRange(0, geometry.getAttribute("position").count - 1);
    // Reducing count via a sliced attribute:
    const src = geometry.getAttribute("position") as THREE.BufferAttribute;
    const clipped = new THREE.BufferAttribute(
      new Float32Array(src.array.subarray(0, src.count * 3 - 3)),
      3,
    );
    geometry.setAttribute("position", clipped);
    expect(buildHeightGrid(geometry)).toBeNull();
  });
});