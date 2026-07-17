import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, MeshRef } from "@/components/components";
import { getMaterial } from "@/scene/resources/material";

export const materialSystem: SceneSystem = (world, scene, _dt) => {
  // Get all material meshes
  const materialMeshes$ = query(world, [MeshRef, MaterialRef]);

  for (const mesh$ of materialMeshes$) {
    const meshId = MeshRef.ref[mesh$];
    if (!meshId) {
      console.error(`entity ${mesh$} MeshRef not found in world`);
      continue;
    }
    const mesh = scene.getObjectById(meshId);
    if (!mesh) {
      console.error(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    const materialId = MaterialRef.ref[mesh$];

    mesh.material = getMaterial(materialId);
  }
};
