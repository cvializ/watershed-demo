import { observe, onAdd, type World } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { Camera, Default, MaterialRef, MeshRef, Terrain } from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { createDefaultMaterialResource } from "@/scene/resources/material";
import { createTerrainResource } from "@/scene/resources/terrain";
import { getCamera } from "@/scene/sceneUtils";

const cameraInitSystem: SceneInitSystem = (world, scene) => {
  const [eid] = query(world, [Camera]);
  const [terrainEid] = query(world, [Terrain, MeshRef]);
  const camera = getCamera(scene);
  if (!camera) {
    console.warn("camera not found");
    return;
  }
  if (!eid) {
    console.log("camera not found");
  }

  const terrain = scene.getObjectById(MeshRef.ref[terrainEid]);
  camera.lookAt(terrain.position);
};

export const sceneInitSystem = (world: World, scene: THREE.Scene): void => {
  observe(world, onAdd(Default, MaterialRef), (eid) => {
    const { materialId: defaultMaterialId } = createDefaultMaterialResource();
    MaterialRef.ref[eid] = defaultMaterialId;
  });

  observe(world, onAdd(Terrain), (eid) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[eid] = meshId;
  });

  observe(world, onAdd(Camera), () => {
    createCameraResource(scene);
    cameraInitSystem(world, scene);
  });
};
