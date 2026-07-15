import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef, Position } from "@/components/components";

export const positionSystem: SceneSystem = (world, scene, _dt) => {
  const meshEntities = query(world, [Position, MeshRef]);
  for (const eid of meshEntities) {
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

    mesh.position.set(Position.x[eid], Position.y[eid], Position.z[eid]);
  }
};
