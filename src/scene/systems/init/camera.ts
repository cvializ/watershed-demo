import { observe, onAdd, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Camera), () => {
    const { camera } = createCameraResource(scene);

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);

    camera.lookAt(terrain.position);
  });
};
