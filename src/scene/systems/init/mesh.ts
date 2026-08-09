import type { SceneInitSystem } from "@/scene/types";

import { MeshEnum } from "@/scene/resources/mesh";
import { createDownslopeArrowsMeshResource } from "@/scene/resources/meshes/downslopeArrows";
import { createSunSphereResource } from "@/scene/resources/meshes/sunSphere";
import { createTerrainGeometry } from "@/scene/resources/meshes/terrain";
import { createTerrainMeshResource } from "@/scene/resources/meshes/terrain";
import { createTerrainWireframeOverlayMesh } from "@/scene/resources/meshes/terrainWireframeOverlay";
import { setObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const initMeshes: SceneInitSystem = (world, scene) => {
  logger.info("[mesh:init]");

  // Create terrain geometry once and share between terrain mesh and wireframe overlay
  const sharedGeometry = createTerrainGeometry();
  
  // Terrain mesh uses shared geometry
  const terrainMesh = createTerrainMeshResource(sharedGeometry);
  setObject(MeshEnum.Terrain, terrainMesh);
  
  // Wireframe overlay uses same geometry so it updates with erosion
  const wireframeOverlay = createTerrainWireframeOverlayMesh(sharedGeometry);
  setObject(MeshEnum.TerrainWireframeOverlay, wireframeOverlay);
  scene.add(wireframeOverlay); // Always add to scene
  
  setObject(MeshEnum.DownslopeArrows, createDownslopeArrowsMeshResource());
  setObject(MeshEnum.SunSphere, createSunSphereResource());
};
