import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { createDownslopeArrowsMeshResource } from "@/scene/resources/downslopeArrows";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createWireframeResource } from "@/scene/resources/wireframe";

export const MeshEnum = {
  Terrain: "Terrain",
  DownslopeArrows: "DownslopeArrows",
  Wireframe: "Wireframe",
} as const;

export type MeshEnum = (typeof MeshEnum)[keyof typeof MeshEnum];

const enumCache = new Map<MeshEnum, THREE.Object3D>();

/**
 * Get a mesh geometry by ID from the cache
 */
export const getMesh = (id: MeshEnum) => {
  const mesh = enumCache.get(id);
  if (!mesh) {
    throw new Error(`Mesh geometry not found: ${id}`);
  }
  return mesh;
};

/**
 * Set a mesh geometry in the cache
 */
export const setMesh = (id: MeshEnum, value: THREE.Object3D) => {
  enumCache.set(id, value);
};

/**
 * Initialize all mesh geometries and add them to the cache
 */
export const initMeshes: SceneInitSystem = (_world, scene) => {
  enumCache.set(MeshEnum.Terrain, createTerrainResource(scene));
  enumCache.set(MeshEnum.DownslopeArrows, createDownslopeArrowsMeshResource(scene));
  enumCache.set(MeshEnum.Wireframe, createWireframeResource(scene));
};
