import { observe, onAdd } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, Terrain, Wireframe } from "@/components/components";
import { createWireframeResource } from "@/scene/resources/wireframe";

export const wireframeInitSystem: SceneInitSystem = (world, scene): void => {
  observe(world, onAdd(Wireframe), (entity$) => {
    // Get the terrain mesh to create wireframe from
    const [terrainEntity$] = query(world, [Terrain, MeshRef]);

    if (!terrainEntity$) {
      console.error("Cannot create wireframe: terrain not found");
      return;
    }

    const terrain = scene.getObjectById(MeshRef.ref[terrainEntity$]);
    if (!terrain || !(terrain instanceof THREE.Mesh)) {
      console.error("Cannot create wireframe: terrain mesh not found");
      return;
    }

    const { meshId } = createWireframeResource(scene, terrain);
    MeshRef.ref[entity$] = meshId;
  });
};
