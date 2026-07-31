import * as THREE from "three";

import { getObject, setObject } from "@/scene/resources/objectCache";

export const MeshEnum = {
  Terrain: "Terrain",
  DownslopeArrows: "DownslopeArrows",
  Wireframe: "Wireframe",
  CloudMesh: "CloudMesh",
  SunSphere: "SunSphere",
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