import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef, Position } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";

export const positionSystem: SceneSystem = (world) => {
  const meshes$ = query(world, [Position, MeshRef]);
  for (const entity$ of meshes$) {
    const meshId = MeshRef.ref[entity$];
    if (!meshId) {
      console.error(`entity ${entity$} MeshRef not found in world`);
      continue;
    }
    const mesh = getMesh(meshId as MeshEnum);
    if (!mesh) {
      console.error(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    mesh.position.set(Position.x[entity$], Position.y[entity$], Position.z[entity$]);
  }
};
