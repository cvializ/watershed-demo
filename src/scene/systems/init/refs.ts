import { observe, onAdd } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, Terrain } from "@/components/components";
import { createTerrainResource } from "@/scene/resources/terrain";

export const refsInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Terrain), (entity$) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[entity$] = meshId;
  });
};
