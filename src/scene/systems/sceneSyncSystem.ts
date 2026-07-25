import { entityExists } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MeshRef } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { visualizationSystem } from "@/scene/systems/visualization";
import { logger } from "@/utils/logger";

const initFlushSystem: SceneSystem = (world, scene) => {
  for (const eid of world.pendingInit) {
    if (!entityExists(world, eid)) continue; // guard: removed before flush
    scene.add(getMesh(MeshRef.ref[eid] as MeshEnum));
  }
  world.pendingInit.length = 0;
};

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  logger.info("[scene:sync]");
  initFlushSystem(world, scene, dt);
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  visualizationSystem(world, scene, dt);
};
