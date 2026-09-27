import * as THREE from "three";

import { logger } from "@/utils/logger";

/**
 * Editor for user-painted terrain height edits.
 *
 * The editor owns a CPU-side float field of signed height offsets, exposed as a
 * DataTexture that every terrain-height consumer samples and adds on top of the
 * simulation's own height field: `used terrain height = computed height + edit`.
 * Keeping the edit as a persistent offset (instead of writing into the compute
 * chain) means the GPU integration in terrain-height.frag stays untouched and no
 * consumer can overwrite a painted bump - the offset is applied identically in the
 * compute shaders, in the per-frame geometry rebuild, and in the height sampler.
 *
 * Coordinate convention mirrors the surface material painter
 * (`src/scene/resources/textures/surfaceMaterial.ts`): paint coordinates are
 * terrain coordinates in `0..terrainSize` (world position plus the half-size
 * offset), mapped to texture coordinates with `u = x / terrainSize`,
 * `v = 1 - y / terrainSize`. All consumers use this same mapping, so a stroke
 * stamped at the cursor position is seen by the water simulation and the mesh at
 * the same place.
 */
export type TerrainHeightEditor = {
  /**
   * Paint a smooth radial edit at terrain position (x, y).
   *
   * Strokes accumulate additively with a cosine falloff (full delta at the
   * centre, zero at the brush edge) and each texel's offset is clamped to
   * `[-maxHeightEdit, +maxHeightEdit]`, so holding a key builds a smooth
   * dome or pit that stops growing at the cap instead of running away.
   *
   * @param x - X coordinate in terrain space (0 to terrainSize)
   * @param y - Y coordinate in terrain space (0 to terrainSize)
   * @param delta - Height offset applied per stroke at the brush centre
   * @param radius - Brush radius in world units
   */
  paint: (
    x: number,
    y: number,
    delta: number,
    radius: number,
  ) => void;

  /**
   * Sample the current height offset at terrain position (x, y), nearest texel.
   */
  getEditAt: (x: number, y: number) => number;

  /**
   * Reset every offset to zero.
   */
  clear: () => void;

  /**
   * The texture carrying the edit field, for binding as a compute-shader sampler.
   */
  getTexture: () => THREE.DataTexture;

  /** Largest offset either direction; keeps held-key stroke accumulation bounded. */
  maxHeightEdit: number;
};

/**
 * Creates the terrain height editor over a fresh all-zero offset field.
 *
 * @param size - Grid resolution per axis (matches the simulation grid)
 * @param terrainSize - Physical terrain side length in world units
 */
export const createTerrainHeightEditor = (
  size: number,
  terrainSize: number,
  maxHeightEdit = 10,
): TerrainHeightEditor => {
  logger.info("[gpu:terrain-height-editing:create]");

  // R: signed height offset applied on top of every computed terrain height.
  const data = new Float32Array(size * size);

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RedFormat,
    THREE.FloatType,
  );
  // Left at the DataTexture default (no flip), like the surface material
  // texture: the `v = 1 - y / terrainSize` mapping below already accounts for
  // the terrain coordinate flip, so array row index and sampler uv agree.
  texture.needsUpdate = true;

  // Convert terrain coordinates to texture coordinates, mirroring
  // createSurfaceMaterialTexture so painted height and painted material stay
  // aligned with each other and with the compute shaders' sampling.
  const worldToUV = (x: number, y: number): { u: number; v: number } => {
    const u = x / terrainSize;
    const v = 1.0 - y / terrainSize; // Flip Y to match terrain coordinates
    return { u, v };
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

          // Cosine falloff: full delta at the centre, smooth glide to zero at
          // the edge, so one stroke already forms a smooth dome or pit.
          const falloff = 0.5 * (1 + Math.cos((Math.PI * distance) / radiusPixels));
          const stroke = delta * falloff;

          const index = py * size + px;
          const edited = data[index] + stroke;
          data[index] = Math.max(
            -maxHeightEdit,
            Math.min(maxHeightEdit, edited),
          );
        }
      }

      texture.needsUpdate = true;
    },

    getEditAt: (x: number, y: number): number => {
      const { u, v } = worldToUV(x, y);

      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = Math.max(0, Math.min(1, v));

      const pixelX = Math.min(size - 1, Math.floor(clampedU * size));
      const pixelY = Math.min(size - 1, Math.floor(clampedV * size));

      return data[pixelY * size + pixelX];
    },

    clear: (): void => {
      data.fill(0);
      texture.needsUpdate = true;
    },

    getTexture: (): THREE.DataTexture => {
      return texture;
    },

    maxHeightEdit,
  };
};