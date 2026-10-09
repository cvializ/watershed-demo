/**
 * Pure, geometry-agnostic helpers for tracing a terrain's drainage network.
 *
 * The terrain is treated as a square height grid laid out row-major: cell
 * `row * gridDim + col` holds the surface height, and each cell drains to at
 * most one other cell per traced surface (its steepest-descent neighbour).
 * Nothing here touches Three.js or the DOM, so the logic stays testable.
 *
 * Two surfaces are traced, and one of them is used for a given hover:
 *
 * 1. the *true* surface, as authored or painted;
 * 2. the *depression-filled* surface, where pits are raised to the level at
 *    which they spill (the standard pre-processing step for D8 delineation).
 *
 * Both are needed. Roughly one cell in nine of the Cobbs Creek height field
 * is a pit - a depression or flat patch whose water has nowhere to go - so
 * tracing only the authored surface fragments: about 94% of cells drain into
 * a pit short of the pour point, and any catchment stops dead at the first pit
 * between the cursor and the hills above it. Tracing only the filled surface
 * is wrong the other way round, because filling turns a closed depression into
 * a dome, so hovering the bottom of a pit would show a single cell instead of
 * the whole basin that actually drains into it. `traceWatershed` therefore
 * picks one of the two per pour point, rather than mixing them.
 */

/**
 * Flat `gridDim * gridDim` array of surface heights, indexed row-major:
 * either raw heights (`Float32Array`, copied out of the terrain geometry) or
 * filled heights (`Float64Array`, since filling adds increments that need the
 * extra precision to stay strictly ordered).
 */
export type HeightGrid = Float32Array | Float64Array;

/**
 * Reverse adjacency as linked lists: for each cell, the list of cells that
 * drain directly into it (sources). Built once from the flow-direction array
 * so that `traceWatershed` can skip the reverse-graph construction on every
 * trace.
 *
 * `head[cell]` points to the first source draining into `cell` (-1 when
 * none), and `next[source]` walks the rest of that source's chain.
 */
type ReverseFlow = {
  head: Int32Array;
  next: Int32Array;
};

/**
 * Where a cell's water goes on each traced surface, as cell indices (`-1`
 * when that surface offers no lower neighbour). `filledFlow` never holds
 * `-1` for an interior cell, so chains traced through it keep running until
 * they reach the edge of the grid.
 *
 * Only one of the two is ever traced for a given pour point, so a chain never
 * stitches together steps from both surfaces.
 *
 * `reverseFlow` is the reverse adjacency (sources for each cell), precomputed
 * once so that `traceWatershed` skips the reverse-graph construction on every
 * trace.
 */
export type DrainageNetwork = {
  /** Where water drains on the authored surface (`-1` for pits and flats). */
  surfaceFlow: Int32Array;
  /** Where water drains on the depression-filled surface. */
  filledFlow: Int32Array;
  /** Precomputed reverse adjacency for fast watershed tracing. */
  reverseFlow: ReverseFlow;
};

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

/** Height step used to keep a filled surface (and plateaus) strictly ordered. */
const FILL_STEP = 1e-5;

/** One priority-flood queue entry: a cell and the water level above it. */
type FloodCell = { cell: number; level: number };

/**
 * Minimal binary min-heap of `FloodCell`, ordered by water level (a factory
 * function rather than a class, per project convention).
 */
const createFloodQueue = (): {
  push: (entry: FloodCell) => void;
  pop: () => FloodCell | undefined;
} => {
  const heap: FloodCell[] = [];

  const push = (entry: FloodCell): void => {
    heap.push(entry);

    // Bubble the new entry up until its parent is at least as low.
    let index = heap.length - 1;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (heap[parentIndex].level <= heap[index].level) {
        break;
      }
      const swap = heap[parentIndex];
      heap[parentIndex] = heap[index];
      heap[index] = swap;
      index = parentIndex;
    }
  };

  const pop = (): FloodCell | undefined => {
    const top = heap[0];
    if (!top) {
      return undefined;
    }

    const last = heap.pop() as FloodCell;
    if (heap.length > 0) {
      // Sift the displaced entry back down until the heap is ordered again.
      heap[0] = last;
      let index = 0;
      for (;;) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        let smallestIndex = index;
        if (
          leftIndex < heap.length &&
          heap[leftIndex].level < heap[smallestIndex].level
        ) {
          smallestIndex = leftIndex;
        }
        if (
          rightIndex < heap.length &&
          heap[rightIndex].level < heap[smallestIndex].level
        ) {
          smallestIndex = rightIndex;
        }
        if (smallestIndex === index) {
          break;
        }
        const swap = heap[smallestIndex];
        heap[smallestIndex] = heap[index];
        heap[index] = swap;
        index = smallestIndex;
      }
    }

    return top;
  };

  return { push, pop };
};

/**
 * Raise every depression until each cell has a strictly-lower neighbour, so
 * water always reaches the edge of the grid instead of vanishing into a pit.
 *
 * Uses the Barnes et al. (2014) *priority-flood* algorithm: every edge cell
 * is a real outlet, seeded into the queue at its own height, and the queue is
 * drained lowest-first, filling each newly reached cell to `max(its own
 * height, the level it was reached at + FILL_STEP)`. Because a cell is queued
 * the first time it is reached, that level is the lowest one reachable from
 * the sea, so pits fill exactly to their spill level, flat patches get a
 * strict order, and no downstream chain can loop or die in a sink.
 *
 * @param heights - `gridDim * gridDim` heights indexed row-major.
 * @param gridDim - Number of cells along each grid axis.
 * @returns A `Float64Array` of filled heights, indexed like the input.
 */
export const fillDepressions = (
  heights: HeightGrid,
  gridDim: number,
): Float64Array => {
  const cellCount = gridDim * gridDim;
  const filled = new Float64Array(cellCount);
  const queued = new Uint8Array(cellCount);
  const queue = createFloodQueue();

  // Seed the outlets: the grid edge is where water actually leaves this
  // terrain, so edge cells must never be filled.
  for (let row = 0; row < gridDim; row++) {
    for (const col of [0, gridDim - 1]) {
      const index = row * gridDim + col;
      if (queued[index] === 0) {
        queued[index] = 1;
        filled[index] = heights[index];
        queue.push({ cell: index, level: heights[index] });
      }
    }
  }
  for (const row of [0, gridDim - 1]) {
    for (let col = 1; col < gridDim - 1; col++) {
      const index = row * gridDim + col;
      if (queued[index] === 0) {
        queued[index] = 1;
        filled[index] = heights[index];
        queue.push({ cell: index, level: heights[index] });
      }
    }
  }

  // Flood inward from the lowest queued cell, so each cell is filled from the
  // lowest water level that can reach it.
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const row = Math.floor(entry.cell / gridDim);
    const col = entry.cell % gridDim;

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
      if (queued[neighbourIndex] === 1) {
        continue;
      }

      // Never lower a cell, and always keep a strict order along the path
      // back to the sea, so plateaus drain too instead of being sinks.
      queued[neighbourIndex] = 1;
      filled[neighbourIndex] = Math.max(
        heights[neighbourIndex],
        entry.level + FILL_STEP,
      );
      queue.push({ cell: neighbourIndex, level: filled[neighbourIndex] });
    }
  }

  return filled;
};

/**
 * Compute the D8 flow direction for every cell: the index of the neighbour
 * that drains the cell, or `-1` when the cell is a local minimum (a sink)
 * with no strictly-lower neighbour.
 *
 * Because a cell only ever points at a strictly-lower cell, the resulting
 * graph is acyclic - every chain of pointers terminates at a sink - so
 * flooding the network backwards never loops. On raw heights roughly a tenth
 * of the cells are sinks, so use `createDrainageNetwork`, which also traces
 * the depression-filled surface, to keep chains running to the edge of the
 * terrain.
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
 * Build the reverse adjacency (sources for each cell) from a flow-direction
 * array, using head/next linked lists.
 */
const buildReverseFlow = (flow: Int32Array, gridDim: number): ReverseFlow => {
  const cellCount = gridDim * gridDim;
  const head = new Int32Array(cellCount).fill(-1);
  const next = new Int32Array(cellCount).fill(-1);

  for (let cell = 0; cell < cellCount; cell++) {
    const downstream = flow[cell];
    if (downstream >= 0) {
      next[cell] = head[downstream];
      head[downstream] = cell;
    }
  }

  return { head, next };
};

/**
 * Build the terrain's drainage network: the D8 flow directions traced over
 * the authored surface, plus those traced over the depression-filled surface.
 *
 * Both steps depend only on the height grid, so a caller that hovers many
 * points on the same terrain builds this once and reuses it.
 *
 * `reverseFlow` is precomputed once from the chosen flow surface, so that
 * `traceWatershed` skips the reverse-graph construction on every trace.
 *
 * @param heights - `gridDim * gridDim` raw heights indexed row-major.
 * @param gridDim - Number of cells along each grid axis.
 * @returns Where each cell drains on either surface; `-1` entries end a
 *   chain on that surface (never inside the filled one).
 */
export const createDrainageNetwork = (
  heights: HeightGrid,
  gridDim: number,
): DrainageNetwork => {
  const surfaceFlow = computeFlowDirections(heights, gridDim);
  const filledFlow = computeFlowDirections(
    fillDepressions(heights, gridDim),
    gridDim,
  );

  return {
    surfaceFlow,
    filledFlow,
    reverseFlow: buildReverseFlow(surfaceFlow, gridDim),
  };
};

/**
 * Collect every cell that drains into `pourIndex`, writing the 0/1 mask into
 * `target` (zeroed first, so one buffer can be reused between hovers).
 *
 * Chains are traced on a single surface, chosen by where the pour point
 * itself sits:
 *
 * - If the pour point holds water (a pit or a flat, so nothing on the
 *   authored surface drains into it), trace the authored surface: everything
 *   that actually collects there is caught, instead of a single cell.
 * - Otherwise trace the depression-filled surface, so the chain reaching the
 *   pour point keeps running instead of dying in the first pit uphill of it.
 *
 * Uses the precomputed `reverseFlow` from the network to skip the reverse-graph
 * construction on every trace.
 *
 * @param network - Where each cell drains, from `createDrainageNetwork`.
 * @param gridDim - Number of cells along each grid axis.
 * @param pourIndex - Grid index of the pour point (`row * gridDim + col`).
 * @param target - `gridDim * gridDim` mask to fill; a new one if omitted.
 * @returns `target` (or a fresh mask), `1` for cells inside the watershed.
 */
export const traceWatershed = (
  network: DrainageNetwork,
  gridDim: number,
  pourIndex: number,
  target: Uint8Array = new Uint8Array(gridDim * gridDim),
): Uint8Array => {
  const flow =
    network.surfaceFlow[pourIndex] === -1
      ? network.surfaceFlow
      : network.filledFlow;

  // Use the precomputed reverse adjacency to skip the linked-list construction
  // on every trace. The flow surface is chosen per pour point (surface when
  // the pour is a pit, filled otherwise), but the reverse graph is cached
  // from the surface flow, so we pick the matching reverse flow.
  const { head, next } =
    flow === network.surfaceFlow
      ? network.reverseFlow
      : buildReverseFlow(network.filledFlow, gridDim);

  // Flood backwards from the pour point to collect its whole catchment.
  target.fill(0);
  const stack: number[] = [pourIndex];
  target[pourIndex] = 1;

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    for (let source = head[cell]; source !== -1; source = next[source]) {
      if (target[source] === 0) {
        target[source] = 1;
        stack.push(source);
      }
    }
  }

  return target;
};

/**
 * Return the set of cells whose water drains into `pourIndex` - the
 * watershed (contributing area) drained by that point.
 *
 * Convenience wrapper over `createDrainageNetwork` + `traceWatershed`. Build
 * the drainage network once and reuse it while hovering, rather than calling
 * this for every point.
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
): Uint8Array =>
  traceWatershed(createDrainageNetwork(heights, gridDim), gridDim, pourIndex);
