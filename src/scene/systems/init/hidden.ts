import { observe, onAdd, onRemove } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Hidden, MeshRef } from "@/components/components";
import { getMesh, type MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

const hideSystem: SceneInitSystem = (world) => {
  observe(world, onAdd(Hidden, MeshRef), (entity$) => {
    // Get all material meshes
    logger.debug("hidden");
    const meshId = MeshRef.ref[entity$] as string;
    if (!meshId) {
      logger.error(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = getMesh(meshId as MeshEnum);
    if (!mesh) {
      logger.error(`mesh with name ${meshId} not found in scene`);
      return;
    }
    mesh.visible = false;
  });
};

const showSystem: SceneInitSystem = (world) => {
  observe(world, onRemove(Hidden, MeshRef), (entity$) => {
    // Get all material meshes

    const meshId = MeshRef.ref[entity$] as MeshEnum;
    if (!meshId) {
      logger.error(`entity ${entity$} MeshRef not found in world`);
      return;
    }
    const mesh = getMesh(meshId as MeshEnum);
    if (!mesh) {
      logger.error(`mesh with name ${meshId} not found in scene`);
      return;
    }
    mesh.visible = true;
  });
};

export const hiddenInitSystem: SceneInitSystem = (world, scene) => {
  hideSystem(world, scene);
  showSystem(world, scene);
};
