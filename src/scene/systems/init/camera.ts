import { observe, onAdd, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Camera), () => {
    const { camera } = createCameraResource(scene);

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = scene.getObjectById(MeshRef.ref[terrainEntity$]);

    camera.lookAt(terrain.position);
  });
};
