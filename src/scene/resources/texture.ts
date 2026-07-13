import * as THREE from "three";

import { createDisplacementTexture } from "@/nodes/texture/createDisplacementTexture";

const cache = new Map<number, THREE.Texture>();

export const getTexture = (id: number) => {
  return cache.get(id);
};

export const registerTextureResource = (id: number, texture: THREE.Texture) => {
  cache.set(id, texture);
};

export const createDefaultHeightMapTextureResource = () => {
  const texture = createDisplacementTexture(512, 12);

  const textureId = texture.id;
  registerTextureResource(texture.id, texture);

  return {
    textureId: textureId,
  };
};
