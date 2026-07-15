import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef, Position } from "@/components/components";

export const positionSystem: SceneSystem = (world, scene, _dt) => {
  const meshEntities = query(world, [Position, MeshRef]);
  for (const entity$ of meshEntities) {
    const meshId = MeshRef.ref[entity$];
    if (!meshId) {
      console.warn(`entity ${entity$} MeshRef not found in world`);
      continue;
    }
    const mesh = scene.getObjectById(meshId);
    if (!mesh) {
      console.warn(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    mesh.position.set(Position.x[entity$], Position.y[entity$], Position.z[entity$]);
  }
};
