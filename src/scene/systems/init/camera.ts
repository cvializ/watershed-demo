import { observe, onAdd, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getCamera } from "@/scene/sceneUtils";

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Camera), () => {
    const camera = getCamera(scene);
    if (!camera) {
      console.error("no camera in scene after add camera");
      return;
    }

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);
    camera.lookAt(terrain.position);
  });
};
