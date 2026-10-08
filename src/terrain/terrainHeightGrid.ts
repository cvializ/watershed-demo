import * as THREE from "three";

/**
 * Row-major grid sampled straight from the terrain geometry, for watershed
 * tracing.
 *
 * The terrain is a square PlaneGeometry height field: vertex index
 * `row * gridDim + col` sits at local plane `(minX + col * cellX,
 * maxY - row * cellY)` with the surface height in local `z`. Reading the
 * grid straight out of the geometry means it reflects any painted/eroded
 * edits, and `heights[row * gridDim + col]` lines up 1:1 with the mesh's
 * own vertex order.
 */
export type TerrainHeightGrid = {
  /** Heights indexed row-major; same indexing as the geometry's vertices. */
  heights: Float32Array;
  /** Cells along each grid axis (`gridDim * gridDim` === vertex count). */
  gridDim: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/**
 * Build a height grid from a terrain geometry's position attribute.
 * Returns `null` if the geometry is not a square grid height field.
 */
export const buildHeightGrid = (
  geometry: THREE.BufferGeometry,
): TerrainHeightGrid | null => {
  const position = geometry.getAttribute("position") as
    | THREE.BufferAttribute
    | undefined;
  if (!position || position.itemSize !== 3) {
    return null;
  }

  const count = position.count;
  const gridDim = Math.round(Math.sqrt(count));

  // A square grid: vertex count must be a perfect square.
  if (gridDim <= 0 || gridDim * gridDim !== count) {
    return null;
  }

  // Local plane bounds (fixed for a PlaneGeometry).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const array = position.array as Float32Array;
  for (let index = 0; index < count; index++) {
    const x = array[index * 3];
    const y = array[index * 3 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Copy the local Z (surface height) per vertex straight into the grid; the
  // geometry is laid out row-major so grid index === vertex index.
  const heights = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    heights[index] = array[index * 3 + 2];
  }

  return { heights, gridDim, minX, maxX, minY, maxY };
};

/**
 * Locate the grid cell nearest to a local-plane position and return its index
 * (`row * gridDim + col`). Coordinates outside the grid clamp to the nearest
 * edge, so a point beyond the terrain still resolves to a valid cell.
 *
 * Mirrors `getTerrainHeightAt`'s mapping so the cell under the cursor matches
 * the height the sampler would return there.
 */
export const getCellIndexAtLocal = (
  grid: TerrainHeightGrid,
  localX: number,
  localY: number,
): number => {
  const { gridDim, minX, maxX, minY, maxY } = grid;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return 0;
  }

  // Normalized grid coordinates; row = 0 sits at maxY.
  const u = ((localX - minX) / width) * (gridDim - 1);
  const v = ((maxY - localY) / height) * (gridDim - 1);

  const col = Math.round(Math.max(0, Math.min(gridDim - 1, u)));
  const row = Math.round(Math.max(0, Math.min(gridDim - 1, v)));

  return row * gridDim + col;
};

/**
 * Convert a world position on the terrain to a grid cell index. With the
 * plane rotated -PI/2 around X, world `x` = local `x` and world `z` =
 * -local `y`, so local `(worldX, -worldZ)`.
 */
export const getCellIndexAtWorld = (
  grid: TerrainHeightGrid,
  worldX: number,
  worldZ: number,
): number => getCellIndexAtLocal(grid, worldX, -worldZ);