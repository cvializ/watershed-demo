import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";

const cache = new Map<number, THREE.Texture>();

export const getTexture = (id: number) => {
  return cache.get(id);
};

export const registerTextureResource = (id: number, texture: THREE.Texture) => {
  cache.set(id, texture);
};

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

export const createDefaultHeightMapTextureResource = () => {
  const texture = createDisplacementTexture(512, 12);

  const textureId = texture.id;
  registerTextureResource(texture.id, texture);

  return {
    textureId: textureId,
  };
};
