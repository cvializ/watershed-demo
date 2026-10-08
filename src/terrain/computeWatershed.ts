/**
 * Pure, geometry-agnostic helpers for tracing a terrain's drainage network.
 *
 * The terrain is treated as a square height grid laid out row-major: cell
 * `row * gridDim + col` holds the surface height, and each cell can drain to
 * at most one other cell (its steepest-descent neighbour). Nothing here
 * touches Three.js or the DOM so the logic stays trivially testable.
 */

/** Flat `gridDim * gridDim` array of surface heights, indexed row-major. */
export type HeightGrid = Float32Array;

/**
 * The eight neighbourhood offsets as `deltaRow`/`deltaCol` pairs (D8).
 * Ordered so that the first strictly-lower neighbour wins ties.
 */
const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/**
 * Compute the D8 flow direction for every cell: the index of the neighbour
 * that drains the cell, or `-1` when the cell is a local minimum (a sink)
 * with no strictly-lower neighbour.
 *
 * Because a cell only ever points at a strictly-lower cell, the resulting
 * graph is acyclic - every chain of pointers terminates at a sink - so
 * flooding the network backwards never loops.
 *
 * @param heights - `gridDim * gridDim` heights indexed row-major.
 * @param gridDim - Number of cells along each grid axis.
 * @returns `gridDim * gridDim` downstream cell indices (or `-1` per sink).
 */
export const computeFlowDirections = (
  heights: HeightGrid,
  gridDim: number,
): Int32Array => {
  const flow = new Int32Array(gridDim * gridDim).fill(-1);

  for (let row = 0; row < gridDim; row++) {
    for (let col = 0; col < gridDim; col++) {
      const index = row * gridDim + col;
      const selfHeight = heights[index];

      let lowestHeight = selfHeight;
      let downstream = -1;

      for (const [deltaRow, deltaCol] of NEIGHBOUR_OFFSETS) {
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
        const neighbourHeight = heights[neighbourIndex];
        if (neighbourHeight < lowestHeight) {
          lowestHeight = neighbourHeight;
          downstream = neighbourIndex;
        }
      }

      flow[index] = downstream;
    }
  }

  return flow;
};

/**
 * Return the set of cells whose water drains into `pourIndex` - the
 * watershed (contributing area) drained by that point.
 *
 * Builds the reverse of the flow-direction graph, then floods backwards from
 * the pour point: every cell that flows (directly or transitively) into the
 * pour point is marked. The pour point itself is always included.
 *
 * @param heights - `gridDim * gridDim` heights indexed row-major.
 * @param gridDim - Number of cells along each grid axis.
 * @param pourIndex - Grid index of the pour point (`row * gridDim + col`).
 * @returns `gridDim * gridDim` mask, `1` for cells inside the watershed.
 */
export const computeWatershed = (
  heights: HeightGrid,
  gridDim: number,
  pourIndex: number,
): Uint8Array => {
  const cellCount = gridDim * gridDim;
  const flow = computeFlowDirections(heights, gridDim);

  // Build the reverse adjacency (who drains into whom) as linked lists:
  // `head[cell]` is the first source draining into `cell`, and `next[source]`
  // walks the rest of that source's chain.
  const head = new Int32Array(cellCount).fill(-1);
  const next = new Int32Array(cellCount).fill(-1);
  for (let cell = 0; cell < cellCount; cell++) {
    const downstream = flow[cell];
    if (downstream >= 0) {
      next[cell] = head[downstream];
      head[downstream] = cell;
    }
  }

  // Flood backwards from the pour point to collect its whole catchment.
  const mask = new Uint8Array(cellCount);
  const stack: number[] = [pourIndex];
  mask[pourIndex] = 1;

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    for (let source = head[cell]; source !== -1; source = next[source]) {
      if (mask[source] === 0) {
        mask[source] = 1;
        stack.push(source);
      }
    }
  }

  return mask;
};