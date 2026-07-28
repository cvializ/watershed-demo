import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";
import { logger } from "@/utils/logger";
import { getObject, setObject } from "@/scene/resources/objectCache";

/**
 * Create a displacement map texture from the terrain height function
 */
export const createDisplacementTexture = (
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

export const TextureEnum = {
  DefaultHeightMap: "DefaultHeightMap",
  HeightMap: "HeightMap",
  WaterHeightMap: "WaterHeightMap",
  CloudShadowMap: "CloudShadowMap",
  VelocityMap: "VelocityMap",
  Simulation: "Simulation",
  PulsingTexture: "PulsingTexture",
} as const;

export type TextureEnum = (typeof TextureEnum)[keyof typeof TextureEnum];

export const setTexture = (id: TextureEnum, value: THREE.Texture) => {
  setObject(id, value);
};

export const getTexture = (id: TextureEnum) => {
  return getObject(id);
};

export const initTextures = () => {
  logger.info("[texture:init]");

  setObject(
    TextureEnum.DefaultHeightMap,
    createDisplacementTexture(512, 12),
  );
};
