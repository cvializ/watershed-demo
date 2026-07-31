import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";
import { logger } from "@/utils/logger";

/**
 * Create a displacement map texture from the terrain height function
 */
export const createDisplacementTextureResource = (
  size: number,
  terrainSize: number,
): THREE.DataTexture => {
  logger.info("[texture:displacement]");

  const data = new Float32Array(size * size);
  const terrainScale = terrainSize / 2;

  for (let i = 0; i < size * size; i++) {
    const x = ((i % size) / size) * terrainSize - terrainScale;
    const z = (Math.floor(i / size) / size) * terrainSize - terrainScale;
    data[i] = calculateHeight(x, z);
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;
  return texture;
};