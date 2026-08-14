import * as THREE from "three";

import { getObject, setObject } from "@/scene/resources/objectCache";
export {
  cloneTerrainGeometryState,
  restoreTerrainGeometryState,
  saveTerrainGeometryState,
  type TerrainGeometryState,
} from "@/scene/resources/meshes/terrainGeometryState";

export const MeshEnum = {
  Terrain: "Terrain",
  DownslopeArrows: "DownslopeArrows",
  CloudMesh: "CloudMesh",
  SunSphere: "SunSphere",
  TerrainWireframeOverlay: "TerrainWireframeOverlay",
} as const;

export type MeshEnum = (typeof MeshEnum)[keyof typeof MeshEnum];

/**
 * Get a mesh geometry by ID from the cache
 */
export const getMesh = (id: MeshEnum) => {
  return getObject(id) as THREE.Mesh;
};

/**
 * Set a mesh geometry in the cache
 */
export const setMesh = (id: MeshEnum, value: THREE.Mesh) => {
  setObject(id, value);
};

/**
 * Get current terrain mesh for debugging/verification
 */
export const getTerrainMesh = (): THREE.Mesh | null => {
  return getMesh(MeshEnum.Terrain);
};
