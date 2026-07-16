import { observe, onAdd, type World } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import {
  Camera,
  Default,
  HeightMap,
  MaterialRef,
  MeshRef,
  Terrain,
  TextureRef,
  Wireframe,
} from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import { createDefaultMaterialResource } from "@/scene/resources/material";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createDefaultHeightMapTextureResource } from "@/scene/resources/texture";
import { createWireframeResource } from "@/scene/resources/wireframe";
import { getCamera } from "@/scene/sceneUtils";
import { hiddenInitSystem } from "@/scene/systems/hidden";
import { initWaterSimulation } from "@/scene/systems/init/waterSimulation";

const cameraInitSystem: SceneInitSystem = (world, scene) => {
  const [cameraEntity$] = query(world, [Camera]);
  if (!cameraEntity$) {
    throw new Error("camera not found in components");
  }

  const camera = getCamera(scene);
  if (!camera) {
    throw new Error("camera not found in scene");
  }

  const [terrainEntity$] = query(world, [Terrain, MeshRef]);
  const terrain = scene.getObjectById(MeshRef.ref[terrainEntity$]);
  camera.lookAt(terrain.position);
};

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  // TODO: constructors directory?

  observe(world, onAdd(Default, MaterialRef), (entity$) => {
    const { materialId: defaultMaterialId } = createDefaultMaterialResource();
    MaterialRef.ref[entity$] = defaultMaterialId;
  });

  observe(world, onAdd(Default, HeightMap, TextureRef), (entity$) => {
    const { textureId } = createDefaultHeightMapTextureResource();
    TextureRef.ref[entity$] = textureId;
  });

  observe(world, onAdd(Terrain), (entity$) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[entity$] = meshId;
  });

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

    const { meshId, materialId } = createWireframeResource(scene, terrain);
    MeshRef.ref[entity$] = meshId;
    MaterialRef.ref[entity$] = materialId;
  });

  observe(world, onAdd(Camera), () => {
    createCameraResource(scene);
    cameraInitSystem(world, scene);
  });
  initWaterSimulation(world, scene);

  hiddenInitSystem(world, scene);
};
