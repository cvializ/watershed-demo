import { observe, onAdd, onRemove, query } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getCamera } from "@/scene/sceneUtils";

export const cameraInitSystem: SceneInitSystem = (world, scene) => {
  observe(world, onAdd(Camera), () => {
    console.log("ON ADD CAMERA");

    const camera = createCameraResource(scene);

    const [terrainEntity$] = query(world, [Terrain, MeshRef]);
    const terrain = getMesh(MeshRef.ref[terrainEntity$] as MeshEnum);
    camera.lookAt(terrain.position);

    scene.add(camera);
  });

  observe(world, onRemove(Camera), () => {
    console.log("ON REMOVE CAMERA");
    const camera = getCamera(scene);
    if (!camera) {
      return;
    }

    scene.remove(camera);
  });
};
