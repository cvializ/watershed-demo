import { query } from "bitecs";
import * as THREE from "three";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, MeshRef } from "@/components/components";
import { getMaterial, MaterialEnum } from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const materialSystem: SceneSystem = (world) => {
  // Get all material meshes
  const materialMeshes$ = query(world, [MeshRef, MaterialRef]);

  for (const mesh$ of materialMeshes$) {
    const meshId = MeshRef.ref[mesh$];
    if (!meshId) {
      logger.error(`entity ${mesh$} MeshRef not found in world`);
      continue;
    }
    const mesh = getMesh(meshId as MeshEnum) as THREE.Mesh;
    if (!mesh) {
      logger.error(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    const materialId = MaterialRef.ref[mesh$];
    if (!materialId) {
      continue;
    }

    mesh.material = getMaterial(materialId as MaterialEnum);
  }
};
