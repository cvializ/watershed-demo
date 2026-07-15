import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, MeshRef } from "@/components/components";
import { getMaterial } from "@/scene/resources/material";

export const materialSystem: SceneSystem = (world, scene, _dt) => {
  const materialMeshEntities = query(world, [MeshRef, MaterialRef]);
  for (const eid of materialMeshEntities) {
    const meshId = MeshRef.ref[eid];
    if (!meshId) {
      console.warn(`entity ${eid} MeshRef not found in world`);
      continue;
    }
    const mesh = scene.getObjectById(meshId);
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    const materialId = MaterialRef.ref[eid];
    mesh.material = getMaterial(materialId);
  }
};
