import * as THREE from "three";

import { logger } from "@/utils/logger";

/**
 * Editor for the terrain height map itself.
 *
 * This owns one authoritative field of terrain heights: it is seeded from the base terrain
 * (`src/scene/resources/textures/displacement.ts`) and every stroke edits the height that is
 * actually stored at each texel, so a painted texel holds the height the user set rather than a
 * delta added on top of whatever the compute chain computed. Consumers bind `getTexture()` as
 * *the* terrain sampler they read heights from, and the bed integration in `terrain-height.frag`
 * writes the edited height into the compute chain, so the mesh rebuild, the flow shaders and the
 * height visualisation all read the same edited field instead of adding a parallel offset.
 *
 * Two consequences of editing the map rather than an offset layer, both deliberate:
 *
 * - A stroke sets a height, so re-stroking the same spot keeps building on the height that is
 *   already there (a dome or a pit), capped at `maxHeightEdit` either side of the base terrain.
 * - Once a stroke has claimed a texel (alpha channel set to 1), that texel's height is whatever
 *   was painted there. Erosion, deposition and slope relaxation are told to skip claimed texels,
 *   because nothing may silently move the ground the user just authored.
 *
 * Coordinate convention mirrors the surface material painter
 * (`src/scene/resources/textures/surfaceMaterial.ts`): paint coordinates are terrain coordinates
 * in `0..terrainSize` (world position plus the half-size offset), mapped to texture coordinates
 * with `u = x / terrainSize`, `v = 1 - y / terrainSize`. The field keeps the same per-texel layout
 * as the base map it was seeded from, so a stroke stamped at the cursor position is read back by
 * every consumer at the place it was painted.
 */
export type TerrainHeightMap = {
  /**
   * Edit the height map around terrain position (x, y).
   *
   * Strokes accumulate with a cosine falloff (full delta at the centre, zero at the brush edge)
   * onto whatever height is already stored at the texel, and each texel is clamped to
   * `base +/- maxHeightEdit`, so holding a key builds a smooth dome or pit that stops at the cap
   * instead of running away.
   *
   * @param x - X coordinate in terrain space (0 to terrainSize)
   * @param y - Y coordinate in terrain space (0 to terrainSize)
   * @param delta - Height change applied at the brush centre, relative to the height there now
   * @param radius - Brush radius in world units
   */
  paint: (
    x: number,
    y: number,
    delta: number,
    radius: number,
  ) => void;

  /**
   * The current terrain height at terrain position (x, y): the painted height where a stroke
   * claimed the texel, otherwise the base terrain.
   */
  getHeightAt: (x: number, y: number) => number;

  /**
   * Whether a stroke has claimed the texel at terrain position (x, y), which is to say whether
   * the height there was authored rather than left as the base terrain.
   */
  isEditedAt: (x: number, y: number) => boolean;

  /**
   * Give every texel back to the base terrain.
   */
  clear: () => void;

  /**
   * The edited height map, for binding as the terrain sampler: R is the height to use, A is 1
   * where a stroke authored that height and 0 where the base terrain still stands.
   */
  getTexture: () => THREE.DataTexture;

  /** Largest edit either direction from the base terrain; keeps stroke accumulation bounded. */
  maxHeightEdit: number;
};

/**
 * Creates an editable height map over a copy of the given base terrain field.
 *
 * @param size - Grid resolution per axis (matches the simulation grid)
 * @param terrainSize - Physical terrain side length in world units
 * @param baseHeightMap - Terrain heights to edit, one float per texel (or an RGBA field whose
 *   red channel carries them, which is what a saved snapshot looks like)
 * @param maxHeightEdit - How far either side of the base terrain a stroke may reach
 */
export const createTerrainHeightMap = (
  size: number,
  terrainSize: number,
  baseHeightMap: THREE.DataTexture,
  maxHeightEdit = 10,
): TerrainHeightMap => {
  logger.info("[gpu:terrain-height-map:create]");

  // Seed the editable field from the base terrain. Both layouts this is handed - the app's
  // RedFormat displacement map and an RGBA snapshot - carry one height per texel, so the copy is
  // one to one and index space stays identical to the seed's.
  const sourceData = baseHeightMap.image.data as Float32Array;
  const sourceChannels = sourceData.length === size * size * 4 ? 4 : 1;
  const base = new Float32Array(size * size);
  for (let index = 0; index < size * size; index++) {
    base[index] = sourceData[index * sourceChannels];
  }

  // The field every consumer reads: R is the height to use at that texel, A is 1 once a stroke
  // authored it. Nothing is painted at creation, so R starts out as the base terrain.
  const field = new Float32Array(size * size * 4);
  for (let index = 0; index < size * size; index++) {
    field[index * 4] = base[index]; // R: height to use
    field[index * 4 + 1] = 0.0; // G: unused
    field[index * 4 + 2] = 0.0; // B: unused
    field[index * 4 + 3] = 0.0; // A: 1 where a stroke authored the height
  }

  const texture = new THREE.DataTexture(
    field,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  // Keep the seed's flip, since the copy above preserved its per-texel layout: a sampler that
  // agreed with the base map before any painting agrees with this field afterwards too.
  texture.flipY = baseHeightMap.flipY;
  texture.needsUpdate = true;

  // Convert terrain coordinates to texture coordinates, mirroring createSurfaceMaterialTexture so
  // painted height and painted material stay aligned with each other and with the compute
  // shaders' sampling.
  const worldToUV = (x: number, y: number): { u: number; v: number } => {
    const u = x / terrainSize;
    const v = 1.0 - y / terrainSize; // Flip Y to match terrain coordinates
    return { u, v };
  };

  /** That texel's index into the field. */
  const terrainToFieldIndex = (x: number, y: number): number => {
    const { u, v } = worldToUV(x, y);

    const clampedU = Math.max(0, Math.min(1, u));
    const clampedV = Math.max(0, Math.min(1, v));

    const texelX = Math.min(size - 1, Math.floor(clampedU * size));
    const texelY = Math.min(size - 1, Math.floor(clampedV * size));

    return texelY * size + texelX;
  };

  return {
    paint: (
      x: number,
      y: number,
      delta: number,
      radius: number,
    ): void => {
      const { u, v } = worldToUV(x, y);

      // Only walk the brush's bounding box, not the whole field.
      const radiusPixels = (radius / terrainSize) * size;
      const centerX = u * size;
      const centerY = v * size;

      const minX = Math.max(0, Math.floor(centerX - radiusPixels));
      const maxX = Math.min(size - 1, Math.ceil(centerX + radiusPixels));
      const minY = Math.max(0, Math.floor(centerY - radiusPixels));
      const maxY = Math.min(size - 1, Math.ceil(centerY + radiusPixels));

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const dx = px - centerX;
          const dy = py - centerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > radiusPixels) {
            continue;
          }

          // Cosine falloff: full delta at the centre, smooth glide to zero at the edge, so one
          // stroke already forms a smooth dome or pit. A brush thinner than a texel degenerates
          // to a single stamp at full strength, which keeps the falloff arithmetic finite.
          const falloff =
            radiusPixels > 0
              ? 0.5 * (1 + Math.cos((Math.PI * distance) / radiusPixels))
              : 1;

          const index = py * size + px;

          // Edit the height that is actually there: the base terrain where nothing was painted
          // yet, the previous stroke's result afterwards. Clamping against the base keeps the
          // cap a distance from the terrain rather than an absolute ceiling, so a texel can never
          // be pushed further than maxHeightEdit from where the terrain puts it.
          const authored = field[index * 4 + 3] > 0.5;
          const current = authored ? field[index * 4] : base[index];
          const edited = current + delta * falloff;
          const floor = base[index] - maxHeightEdit;
          const ceiling = base[index] + maxHeightEdit;

          field[index * 4] = Math.min(
            ceiling,
            Math.max(floor, edited),
          );
          field[index * 4 + 3] = 1;
        }
      }

      texture.needsUpdate = true;
    },

    getHeightAt: (x: number, y: number): number => {
      return field[terrainToFieldIndex(x, y) * 4];
    },

    isEditedAt: (x: number, y: number): boolean => {
      return field[terrainToFieldIndex(x, y) * 4 + 3] > 0.5;
    },

    clear: (): void => {
      for (let index = 0; index < size * size; index++) {
        field[index * 4] = base[index];
        field[index * 4 + 3] = 0.0;
      }

      texture.needsUpdate = true;
    },

    getTexture: (): THREE.DataTexture => {
      return texture;
    },

    maxHeightEdit,
  };
};