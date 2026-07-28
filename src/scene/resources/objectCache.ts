import * as THREE from "three";

import { MeshEnum } from "@/scene/resources/mesh";
import type { MeshEnum as MeshEnumType } from "@/scene/resources/mesh";
import { TextureEnum } from "@/scene/resources/texture";
import type { TextureEnum as TextureEnumType } from "@/scene/resources/texture";
import { MaterialEnum } from "@/scene/resources/material";
import type { MaterialEnum as MaterialEnumType } from "@/scene/resources/material";

/**
 * Global object cache that holds all resource objects indexed by their type and ID.
 * This replaces individual caches in each resource module.
 */

// Type mapping for meshes (Object3D)
type MeshValueMap = {
  [MeshEnum.Terrain]: THREE.Object3D;
  [MeshEnum.DownslopeArrows]: THREE.Object3D;
  [MeshEnum.Wireframe]: THREE.Object3D;
};

// Type mapping for textures
type TextureValueMap = {
  [TextureEnum.DefaultHeightMap]: THREE.Texture;
  [TextureEnum.HeightMap]: THREE.Texture;
  [TextureEnum.WaterHeightMap]: THREE.Texture;
  [TextureEnum.CloudShadowMap]: THREE.Texture;
  [TextureEnum.VelocityMap]: THREE.Texture;
  [TextureEnum.Simulation]: THREE.Texture;
  [TextureEnum.PulsingTexture]: THREE.Texture;
};

// Type mapping for materials
type MaterialValueMap = {
  [MaterialEnum.Default]: THREE.Material;
  [MaterialEnum.HeightVisualization]: THREE.Material;
  [MaterialEnum.Normal]: THREE.Material;
  [MaterialEnum.DownslopeArrowsMaterial]: THREE.Material;
  [MaterialEnum.Slope]: THREE.Material;
  [MaterialEnum.WaterFlow]: THREE.Material;
  [MaterialEnum.PulsingSimulation]: THREE.Material;
};

// Union of all enum types
export type ResourceEnum = MeshEnumType | TextureEnumType | MaterialEnumType;

// Extract value type from the appropriate map based on enum
export type ResourceValue<T extends ResourceEnum> = T extends MeshEnumType
  ? T extends keyof MeshValueMap
    ? MeshValueMap[T]
    : never
  : T extends TextureEnumType
    ? T extends keyof TextureValueMap
      ? TextureValueMap[T]
      : never
    : T extends MaterialEnumType
      ? T extends keyof MaterialValueMap
        ? MaterialValueMap[T]
        : never
      : never;

// Global cache instance - uses 'any' internally but provides type-safe access
const objectCache = new Map<ResourceEnum, any>();

/**
 * Get a resource from the cache by its enum ID
 */
export const getObject = <T extends ResourceEnum>(id: T): ResourceValue<T> => {
  const value = objectCache.get(id);
  if (!value) {
    throw new Error(`Resource not found: ${id}`);
  }
  return value;
};

/**
 * Set a resource in the cache by its enum ID
 */
export const setObject = <T extends ResourceEnum>(id: T, value: ResourceValue<T>): void => {
  objectCache.set(id, value);
};

/**
 * Check if a resource exists in the cache
 */
export const hasObject = (id: ResourceEnum): boolean => {
  return objectCache.has(id);
};

/**
 * Get all entries in the cache
 */
export const getEntries = (): Array<[ResourceEnum, any]> => {
  return Array.from(objectCache.entries());
};

/**
 * Clear all resources from the cache
 */
export const clear = (): void => {
  objectCache.clear();
};