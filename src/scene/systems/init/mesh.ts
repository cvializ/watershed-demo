import type { SceneInitSystem } from "@/scene/types";

import { MeshEnum } from "@/scene/resources/mesh";
import { createDownslopeArrowsMeshResource } from "@/scene/resources/meshes/downslopeArrows";
import { createSunSphereResource } from "@/scene/resources/meshes/sunSphere";
import { createTerrainMeshResource } from "@/scene/resources/meshes/terrain";
import { createWireframeMeshResource } from "@/scene/resources/meshes/wireframe";
import { setObject } from "@/scene/resources/objectCache";
import { logger } from "@/utils/logger";

export const initMeshes: SceneInitSystem = () => {
  logger.info("[mesh:init]");

  setObject(MeshEnum.Terrain, createTerrainMeshResource());
  setObject(MeshEnum.DownslopeArrows, createDownslopeArrowsMeshResource());
  setObject(MeshEnum.Wireframe, createWireframeMeshResource());
  setObject(MeshEnum.SunSphere, createSunSphereResource());
};
