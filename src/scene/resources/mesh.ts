import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { createDownslopeArrowsMeshResource } from "@/scene/resources/downslopeArrows";
import { getObject, setObject } from "@/scene/resources/objectCache";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createWireframeResource } from "@/scene/resources/wireframe";
import { logger } from "@/utils/logger";

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

/**
 * Create a sphere mesh for the sun
 */
const createSunSphereResource = () => {
  logger.info("[sunSphere:resource]");

  const geometry = new THREE.SphereGeometry(0.5, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
  const sunSphere = new THREE.Mesh(geometry, material);

  // Always render the sun sphere regardless of frustum culling
  // This is necessary because the sun orbits at distance ~25 and may be culled
  sunSphere.frustumCulled = false;

  return sunSphere;
};

/**
 * Initialize all mesh geometries and add them to the cache
 */
export const initMeshes: SceneInitSystem = (_world, _scene) => {
  logger.info("[mesh:init]");

  setObject(MeshEnum.Terrain, createTerrainResource());
  setObject(MeshEnum.DownslopeArrows, createDownslopeArrowsMeshResource());
  setObject(MeshEnum.Wireframe, createWireframeResource());
  setObject(MeshEnum.SunSphere, createSunSphereResource());
};
