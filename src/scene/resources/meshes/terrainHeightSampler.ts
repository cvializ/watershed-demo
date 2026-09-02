import * as THREE from "three";

import { getMesh, MeshEnum } from "@/scene/resources/mesh";

/**
 * Structural metadata for sampling the terrain heightfield.
 *
 * The terrain is a square grid heightfield: a PlaneGeometry rotated -PI/2 around
 * the X axis. Each vertex's local Z component holds the surface height, which
 * becomes the world Y after the rotation.
 */
type TerrainSampler = {
  positionArray: Float32Array;
  /** Number of vertices along each grid axis (gridDim * gridDim === vertex count). */
  gridDim: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

// Cache the structural sampler so we only scan the vertex array once per
// geometry instance. The live heights are read from the shared position array
// on every sample, so paint/restore mutations are reflected automatically.
let cachedGeometry: THREE.BufferGeometry | null = null;
let cachedSampler: TerrainSampler | null = null;

/**
 * Build the structural sampler from a terrain geometry.
 * Returns null if the geometry is not a square grid heightfield.
 */
const buildSampler = (
  geometry: THREE.BufferGeometry,
): TerrainSampler | null => {
  const positionAttribute = geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute | null;

  if (!positionAttribute || positionAttribute.itemSize !== 3) {
    return null;
  }

  const count = positionAttribute.count;
  const gridDim = Math.round(Math.sqrt(count));

  // The terrain is a square grid, so vertex count must be a perfect square.
  if (gridDim * gridDim !== count) {
    return null;
  }

  const positionArray = positionAttribute.array as Float32Array;

  // Local plane bounds (the X/Y extent is fixed for a PlaneGeometry).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < count; index++) {
    const x = positionArray[index * 3];
    const y = positionArray[index * 3 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { positionArray, gridDim, minX, maxX, minY, maxY };
};

/**
 * Sample the terrain surface height (world Y) at a world (x, z) position by
 * bilinearly interpolating the terrain heightfield geometry.
 *
 * Returns null when the terrain mesh is unavailable or not a valid grid.
 */
export const getTerrainHeightAt = (
  worldX: number,
  worldZ: number,
): number | null => {
  let terrainMesh: THREE.Mesh;
  try {
    terrainMesh = getMesh(MeshEnum.Terrain);
  } catch {
    return null;
  }

  const geometry = terrainMesh.geometry as THREE.BufferGeometry;

  if (geometry !== cachedGeometry) {
    cachedGeometry = geometry;
    cachedSampler = buildSampler(geometry);
  }

  const sampler = cachedSampler;
  if (!sampler) {
    return null;
  }

  // Map world (x, z) to local plane (x, y). With rotation.x = -PI/2:
  //   world.x = local.x,  world.y = local.z (height),  world.z = -local.y
  const localX = worldX;
  const localY = -worldZ;

  const { minX, maxX, minY, maxY, gridDim, positionArray } = sampler;

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return null;
  }

  // Normalized grid coordinates. iy = 0 sits at local maxY.
  let u = ((localX - minX) / width) * (gridDim - 1);
  let v = ((maxY - localY) / height) * (gridDim - 1);

  // Clamp to the terrain bounds so out-of-range positions sample the edge.
  u = Math.max(0, Math.min(gridDim - 1, u));
  v = Math.max(0, Math.min(gridDim - 1, v));

  const baseX = Math.floor(u);
  const baseY = Math.floor(v);
  const fracX = u - baseX;
  const fracY = v - baseY;

  const nextX = Math.min(gridDim - 1, baseX + 1);
  const nextY = Math.min(gridDim - 1, baseY + 1);

  // Local Z component holds the height at each vertex.
  const heightAt = (vertexX: number, vertexY: number): number =>
    positionArray[(vertexY * gridDim + vertexX) * 3 + 2];

  const topLeft = heightAt(baseX, baseY);
  const topRight = heightAt(nextX, baseY);
  const bottomLeft = heightAt(baseX, nextY);
  const bottomRight = heightAt(nextX, nextY);

  const top = topLeft + (topRight - topLeft) * fracX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * fracX;

  return top + (bottom - top) * fracY;
};

/**
 * Reset the cached sampler. Intended for tests and geometry swaps.
 */
export const resetTerrainHeightSampler = (): void => {
  cachedGeometry = null;
  cachedSampler = null;
};
