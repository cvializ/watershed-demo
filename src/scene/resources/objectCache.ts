import * as THREE from "three";

import { createCameraResource } from "@/renderer/resources/camera";
import { GeneralObjectEnum } from "@/scene/resources/generalObject";
import { MaterialEnum } from "@/scene/resources/material";
import { MeshEnum } from "@/scene/resources/mesh";
import { createSunLightResource } from "@/scene/resources/sunLight";
import { TextureEnum } from "@/scene/resources/texture";
import { logger } from "@/utils/logger";

/**
 * Global object cache that holds all resource objects indexed by their type and ID.
 * This replaces individual caches in each resource module.
 */

// Union of all enum types
export type ResourceEnum =
  | (typeof MeshEnum)[keyof typeof MeshEnum]
  | (typeof TextureEnum)[keyof typeof TextureEnum]
  | (typeof MaterialEnum)[keyof typeof MaterialEnum]
  | (typeof GeneralObjectEnum)[keyof typeof GeneralObjectEnum];

// Maps each enum to its value type
export type ResourceValue<T extends ResourceEnum> =
  T extends (typeof MeshEnum)[keyof typeof MeshEnum]
    ? THREE.Object3D
    : T extends (typeof TextureEnum)[keyof typeof TextureEnum]
      ? THREE.Texture
      : T extends (typeof MaterialEnum)[keyof typeof MaterialEnum]
        ? THREE.Material
        : T extends (typeof GeneralObjectEnum)[keyof typeof GeneralObjectEnum]
          ? THREE.Object3D
          : never;

// Global cache instance - provides type-safe access via getObject/setObject
const objectCache = new Map<
  ResourceEnum,
  THREE.Object3D | THREE.Texture | THREE.Material
>();

/**
 * Get a resource from the cache by its enum ID
 */
export const getObject = <T extends ResourceEnum>(id: T): ResourceValue<T> => {
  const value = objectCache.get(id) as ResourceValue<T>;
  if (!value) {
    throw new Error(`Resource not found: ${id}`);
  }
  return value;
};

/**
 * Set a resource in the cache by its enum ID
 */
export const setObject = <T extends ResourceEnum>(
  id: T,
  value: ResourceValue<T>,
): void => {
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
export const getEntries = (): Array<
  [ResourceEnum, THREE.Object3D | THREE.Texture | THREE.Material]
> => {
  return Array.from(objectCache.entries());
};

/**
 * Clear all resources from the cache
 */
export const clear = (): void => {
  objectCache.clear();
};

/**
 * Initialize all objects in the cache into the scene
 */
export const initObjects = (): void => {
  logger.debug(`[objectCache:init] ${objectCache.size} objects`);

  setObject(GeneralObjectEnum.Camera, createCameraResource());
  setObject(GeneralObjectEnum.SunLight, createSunLightResource());
};
