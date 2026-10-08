import { expect, test } from "@playwright/test";
import {
  createTerrainGeometry,
  TERRAIN_MESH_SEGMENTS,
} from "src/scene/resources/meshes/terrain";
import {
  type DrainageNetwork,
  computeFlowDirections,
  computeWatershed,
  createDrainageNetwork,
  fillDepressions,
  traceWatershed,
} from "src/terrain/computeWatershed";
import {
  buildHeightGrid,
  getCellIndexAtLocal,
  getCellIndexAtWorld,
} from "src/terrain/terrainHeightGrid";
import * as THREE from "three";

/** Read a row-major grid as a plain array for easy assertion. */
const grid = (heights: Float32Array | Float64Array | Uint8Array): number[] =>
  Array.from(heights);

/** True when every marked cell is reachable from `start` through marked cells. */
const isContiguous = (
  mask: Uint8Array,
  gridDim: number,
  start: number,
): boolean => {
  const seen = new Uint8Array(mask.length);
  const stack = [start];
  seen[start] = 1;
  let visited = 0;

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    visited++;
    const row = Math.floor(cell / gridDim);
    const col = cell % gridDim;

    for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
      for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
        const neighbourRow = row + deltaRow;
        const neighbourCol = col + deltaCol;
        if (
          neighbourRow < 0 ||
          neighbourRow >= gridDim ||
          neighbourCol < 0 ||
          neighbourCol >= gridDim
        ) {
          continue;
        }
        const neighbourIndex = neighbourRow * gridDim + neighbourCol;
        if (mask[neighbourIndex] === 1 && seen[neighbourIndex] === 0) {
          seen[neighbourIndex] = 1;
          stack.push(neighbourIndex);
        }
      }
    }
  }

  return visited === grid(mask).reduce((total, value) => total + value, 0);
};

/** True when `cell` has at least one strictly-lower neighbour. */
const hasLowerNeighbour = (
  heights: Float32Array | Float64Array,
  gridDim: number,
  cell: number,
): boolean => {
  const row = Math.floor(cell / gridDim);
  const col = cell % gridDim;

  for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
    for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
      const neighbourRow = row + deltaRow;
      const neighbourCol = col + deltaCol;
      if (
        neighbourRow < 0 ||
        neighbourRow >= gridDim ||
        neighbourCol < 0 ||
        neighbourCol >= gridDim ||
        (deltaRow === 0 && deltaCol === 0)
      ) {
        continue;
      }
      if (heights[neighbourRow * gridDim + neighbourCol] < heights[cell]) {
        return true;
      }
    }
  }

  return false;
};

/** A mask of `cellCount` cells with only `index` set to 1. */
const onlyCell = (cellCount: number, index: number): number[] =>
  Array.from({ length: cellCount }, (_, cell) => (cell === index ? 1 : 0));

/** Follow a flow-direction chain and report whether it ends at `pourIndex`. */
const chainReachesPour = (
  flow: Int32Array,
  start: number,
  pourIndex: number,
): boolean => {
  let current = start;
  const seen = new Set<number>();
  while (current !== pourIndex) {
    const downstream = flow[current];
    if (downstream === -1 || seen.has(current)) {
      return false;
    }
    seen.add(current);
    current = downstream;
  }
  return true;
};

/** A 3×3 bowl: a pit of height 1 ringed by height 5. */
const bowl = new Float32Array([5, 5, 5, 5, 1, 5, 5, 5, 5]);

/** 5×5 flat plain with a ring of pits around a height-2 hummock. */
const plateauWithPits = new Float32Array([
  3,
  3,
  3,
  3,
  3, //
  3,
  1,
  1,
  1,
  3, //
  3,
  1,
  2,
  1,
  3, //
  3,
  1,
  1,
  1,
  3, //
  3,
  3,
  3,
  3,
  3, //
]);

test.describe("computeFlowDirections", () => {
  test("a corner-to-corner slope points every cell toward the low corner", () => {
    // 3×3 where height = row + col, so water always seeks (0,0).
    const heights = new Float32Array([
      0,
      1,
      2, //
      1,
      2,
      3, //
      2,
      3,
      4, //
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
      5,
      5,
      5, //
      5,
      1,
      5, //
      5,
      5,
      5, //
    ]);

    const flow = computeFlowDirections(heights, 3);
    expect(flow[4]).toBe(-1); // centre sink
  });
});

test.describe("computeWatershed", () => {
  test("pouring at the funnel low catches the whole grid", () => {
    const heights = new Float32Array([
      0,
      1,
      2, //
      1,
      2,
      3, //
      2,
      3,
      4, //
    ]);

    const mask = computeWatershed(heights, 3, 0);
    expect(grid(mask)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("pouring at the highest corner catches only that cell", () => {
    const heights = new Float32Array([
      0,
      1,
      2, //
      1,
      2,
      3, //
      2,
      3,
      4, //
    ]);

    // Cell 8 (row 2, col 2) is the peak; nothing drains into it.
    const mask = computeWatershed(heights, 3, 8);
    expect(grid(mask)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  test("a diagonal chain of contributors is traced back correctly", () => {
    // Same slope: cell 3 (row1,col0) is fed by cells 6 (row2,col0) and
    // 7 (row2,col1), and nothing else reaches it.
    const heights = new Float32Array([
      0,
      1,
      2, //
      1,
      2,
      3, //
      2,
      3,
      4, //
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

test.describe("fillDepressions", () => {
  test("fills a pit to the level where it spills", () => {
    const filled = fillDepressions(bowl, 3);

    // The pit is raised to the rim height, and no further.
    expect(filled[4]).toBeGreaterThan(5);
    expect(filled[4]).toBeLessThan(5.01);

    // Everything else keeps its authored height.
    expect(grid(filled)).toEqual([5, 5, 5, 5, filled[4], 5, 5, 5, 5]);
  });

  test("never lowers a cell, and leaves the edge alone", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;
    const filled = fillDepressions(built.heights, built.gridDim);
    const { gridDim } = built;

    for (let cell = 0; cell < filled.length; cell++) {
      expect(filled[cell]).toBeGreaterThanOrEqual(built.heights[cell]);

      const row = Math.floor(cell / gridDim);
      const col = cell % gridDim;
      const onEdge =
        row === 0 || col === 0 || row === gridDim - 1 || col === gridDim - 1;
      if (onEdge) {
        expect(filled[cell]).toBe(built.heights[cell]);
      }
    }
  });

  test("gives every interior cell a strictly-lower neighbour", () => {
    for (const heights of [bowl, plateauWithPits]) {
      const gridDim = Math.round(Math.sqrt(heights.length));
      const filled = fillDepressions(heights, gridDim);

      for (let cell = 0; cell < filled.length; cell++) {
        const row = Math.floor(cell / gridDim);
        const col = cell % gridDim;
        const onEdge =
          row === 0 || col === 0 || row === gridDim - 1 || col === gridDim - 1;
        if (!onEdge) {
          expect(hasLowerNeighbour(filled, gridDim, cell)).toBe(true);
        }
      }
    }
  });

  test("does the same for the real terrain", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;
    const { gridDim } = built;
    const filled = fillDepressions(built.heights, gridDim);

    let sinks = 0;
    for (let cell = 0; cell < filled.length; cell++) {
      if (!hasLowerNeighbour(filled, gridDim, cell)) {
        const row = Math.floor(cell / gridDim);
        const col = cell % gridDim;
        // Only edge cells may stay sinks; they are the outlets the flood was
        // seeded from.
        if (
          row !== 0 &&
          col !== 0 &&
          row !== gridDim - 1 &&
          col !== gridDim - 1
        ) {
          sinks++;
        }
      }
    }
    expect(sinks).toBe(0);
  });
});

test.describe("createDrainageNetwork", () => {
  test("a flat plain gets an order instead of every cell being a sink", () => {
    const plain = new Float32Array(Array(25).fill(5));
    const network = createDrainageNetwork(plain, 5);

    // Interior cells of a flat plain used to be sinks, so a hover there
    // showed a single cell; now each one drains somewhere.
    for (const cell of [6, 7, 8, 11, 12, 13, 16, 17, 18]) {
      expect(network.filledFlow[cell]).toBeGreaterThanOrEqual(0);
    }
  });

  test("no chain dies in an interior pit on the real terrain", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;
    const { gridDim } = built;
    const network = createDrainageNetwork(built.heights, gridDim);

    let diedShortOfEdge = 0;
    for (let cell = 0; cell < network.filledFlow.length; cell++) {
      let current = cell;
      let steps = 0;
      while (network.filledFlow[current] !== -1 && steps < 1000) {
        current = network.filledFlow[current];
        steps++;
      }

      const row = Math.floor(current / gridDim);
      const col = current % gridDim;
      const reachedEdge =
        row === 0 || col === 0 || row === gridDim - 1 || col === gridDim - 1;
      if (!reachedEdge) {
        diedShortOfEdge++;
      }
    }

    // Before filling pits, almost every chain ended in one.
    expect(diedShortOfEdge).toBe(0);
  });
});

test.describe("traceWatershed", () => {
  test("hovering a closed depression still shows everything that drains into it", () => {
    const network = createDrainageNetwork(bowl, 3);

    // Water on the rim runs into the pit, so the whole bowl drains into the
    // pit - filling must not invert that into a dome, or hovering the pit
    // bottom would show a single cell.
    expect(grid(traceWatershed(network, 3, 4))).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);

    // Hovering a rim cell, whose water falls straight into the pit, shows the
    // two cells that reach it.
    expect(grid(traceWatershed(network, 3, 0))).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  test("a catchment reaches across a ring of pits instead of stopping at them", () => {
    const network = createDrainageNetwork(plateauWithPits, 5);

    // Hovering a cell inside the ring of pits catches the plateau that drains
    // into them: water on the outer rows runs inward, and the hummock in the
    // middle drains through the ring too.
    expect(grid(traceWatershed(network, 5, 6))).toEqual([
      1,
      1,
      1,
      0,
      0, //
      1,
      1,
      0,
      0,
      0, //
      1,
      0,
      1,
      0,
      0, //
      0,
      0,
      0,
      0,
      0, //
      0,
      0,
      0,
      0,
      0, //
    ]);

    // Hovering the hummock in the middle shows only itself: it is the high
    // point of the ring, so nothing drains into it.
    expect(grid(traceWatershed(network, 5, 12))).toEqual(onlyCell(25, 12));
  });

  test("a flat plain has nowhere for water to run, so only the hovered cell shows", () => {
    const plain = new Float32Array(Array(25).fill(5));
    const network = createDrainageNetwork(plain, 5);

    // Every cell of the plain is a flat sink: no chain reaches any other, so
    // the honest answer is just the cell under the cursor.
    expect(grid(traceWatershed(network, 5, 0))).toEqual(onlyCell(25, 0));
  });

  test("writes into a reused mask, clearing the previous result", () => {
    const network = createDrainageNetwork(plateauWithPits, 5);
    const reused = new Uint8Array(25).fill(1);

    const mask = traceWatershed(network, 5, 12, reused);

    expect(mask).toBe(reused);
    expect(grid(mask).reduce((total, value) => total + value, 0)).toBe(1);
  });

  test("traces the whole valley above a point on Cobbs Creek", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;
    const { gridDim, heights } = built;
    const network: DrainageNetwork = createDrainageNetwork(heights, gridDim);

    // A cell on the creek past Cedar Park: tracing back must reach the ridge
    // behind it, not stall in the first pit on the hillside.
    const pour = 60 * gridDim + 40;
    const mask = traceWatershed(network, gridDim, pour);
    const size = grid(mask).reduce((total, value) => total + value, 0);

    expect(size).toBeGreaterThan(3000);
    expect(isContiguous(mask, gridDim, pour)).toBe(true);

    // And the traced chain of every marked cell actually reaches the pour
    // point, so the highlight is one connected catchment.
    const tracedFlow =
      network.surfaceFlow[pour] === -1
        ? network.surfaceFlow
        : network.filledFlow;
    for (let cell = 0; cell < mask.length; cell++) {
      if (mask[cell] === 1) {
        expect(chainReachesPour(tracedFlow, cell, pour)).toBe(true);
      }
    }
  });

  test("a point on the inter-valley ridge drains away from itself", () => {
    const geometry = createTerrainGeometry();
    const built = buildHeightGrid(geometry)!;
    const { gridDim, heights } = built;

    const network = createDrainageNetwork(heights, gridDim);

    // A high point on the divide above Cedar Park: nothing drains into it,
    // and nothing did before either.
    expect(grid(traceWatershed(network, gridDim, 80 * gridDim + 80))).toEqual(
      onlyCell(gridDim * gridDim, 80 * gridDim + 80),
    );
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
