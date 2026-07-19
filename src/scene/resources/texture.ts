import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";

/**
 * Create a displacement map texture from the terrain height function
 */
const createDisplacementTexture = (size: number, terrainSize: number): THREE.DataTexture => {
  const data = new Float32Array(size * size);
  const terrainScale = terrainSize / 2;

  for (let i = 0; i < size * size; i++) {
    const x = ((i % size) / size) * terrainSize - terrainScale;
    const z = (Math.floor(i / size) / size) * terrainSize - terrainScale;
    data[i] = calculateHeight(x, z);
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
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
} as const;

export type TextureEnum = (typeof TextureEnum)[keyof typeof TextureEnum];

const enumCache = new Map<TextureEnum, THREE.Texture>();

export const setTexture = (id: TextureEnum, value: THREE.Texture) => {
  enumCache.set(id, value);
};

export const getTexture = (id: TextureEnum) => {
  const texture = enumCache.get(id);
  if (!texture) {
    throw new Error(`Texture not found ${id}`);
  }
  return texture;
};

export const initTextures = () => {
  enumCache.set(TextureEnum.DefaultHeightMap, createDisplacementTexture(512, 12));
};
