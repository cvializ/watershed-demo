import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef, Position } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const positionSystem: SceneSystem = (world) => {
  const meshes$ = query(world, [Position, MeshRef]);
  for (const entity$ of meshes$) {
    const meshId = MeshRef.ref[entity$];
    if (!meshId) {
      logger.error(`entity ${entity$} MeshRef not found in world`);
      continue;
    }
    const mesh = getMesh(meshId as MeshEnum);
    if (!mesh) {
      logger.error(`mesh with id ${meshId} not found in scene`);
      continue;
    }

    mesh.position.set(
      Position.x[entity$],
      Position.y[entity$],
      Position.z[entity$],
    );
  }
};
