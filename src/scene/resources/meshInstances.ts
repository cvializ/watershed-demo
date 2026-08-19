import * as THREE from "three";

import { getMesh, type MeshEnum } from "@/scene/resources/mesh";

/**
 * A factory that produces a fresh mesh for a single entity.
 *
 * Used for mesh types where each entity needs its own object (e.g. animals),
 * as opposed to shared singleton meshes (e.g. terrain) that are reused across
 * entities through the object cache.
 */
export type MeshInstanceFactory = () => THREE.Mesh;

// Mesh types that require one mesh instance per entity, mapped to their factory.
const instanceFactories = new Map<MeshEnum, MeshInstanceFactory>();

// Live per-entity mesh instances, keyed by entity id.
const entityInstances = new Map<number, THREE.Mesh>();

/**
 * Register a factory for a mesh type that requires a per-entity instance.
 *
 * Call this during scene init (see `initMeshes`) for every mesh type that can
 * be referenced by multiple entities.
 */
export const registerMeshInstanceFactory = (
  meshId: MeshEnum,
  factory: MeshInstanceFactory,
): void => {
  instanceFactories.set(meshId, factory);
};

/**
 * Whether a given mesh type requires a per-entity instance.
 */
export const hasMeshInstanceFactory = (meshId: MeshEnum): boolean =>
  instanceFactories.has(meshId);

/**
 * Create a fresh mesh instance for an entity and track it for later lookup and
 * disposal.
 */
export const createMeshInstance = (
  entity$: number,
  meshId: MeshEnum,
): THREE.Mesh => {
  const factory = instanceFactories.get(meshId);
  if (!factory) {
    throw new Error(`No instance factory registered for mesh ${meshId}`);
  }
  const instance = factory();
  entityInstances.set(entity$, instance);
  return instance;
};

/**
 * Get the per-entity instance for an entity, if one has been created.
 */
export const getMeshInstance = (entity$: number): THREE.Mesh | undefined =>
  entityInstances.get(entity$);

/**
 * Resolve the mesh to use for an entity.
 *
 * Returns the entity's own instance when the mesh type requires per-entity
 * instances, otherwise the shared cached mesh. Returns `undefined` when an
 * instance was expected but has not been created yet.
 */
export const resolveEntityMesh = (
  entity$: number,
  meshId: MeshEnum,
): THREE.Mesh | undefined => {
  if (hasMeshInstanceFactory(meshId)) {
    return getMeshInstance(entity$);
  }
  return getMesh(meshId);
};

/**
 * Dispose and forget a per-entity instance.
 */
export const disposeMeshInstance = (entity$: number): void => {
  const instance = entityInstances.get(entity$);
  if (!instance) {
    return;
  }
  entityInstances.delete(entity$);
  instance.geometry.dispose();
  if (Array.isArray(instance.material)) {
    instance.material.forEach((material) => material.dispose());
  } else {
    instance.material.dispose();
  }
};

/**
 * Reset all registered factories and live instances. Intended for tests.
 */
export const resetMeshInstances = (): void => {
  instanceFactories.clear();
  entityInstances.clear();
};
