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
  VelocityMapOf,
  WaterHeightmapOf,
  WaterSimulation,
} from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import {
  createDefaultMaterialResource,
  createWaterVisualizationMaterial,
} from "@/scene/resources/material";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createDefaultHeightMapTextureResource, getTexture } from "@/scene/resources/texture";
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

  observe(world, onAdd(Default, HeightMap, TextureRef), (eid) => {
    const { textureId } = createDefaultHeightMapTextureResource();
    TextureRef.ref[eid] = textureId;
  });

  observe(world, onAdd(Terrain), (eid) => {
    const { meshId } = createTerrainResource(scene);
    MeshRef.ref[eid] = meshId;
  });

  observe(world, onAdd(Camera), () => {
    createCameraResource(scene);
    cameraInitSystem(world, scene);
  });

  // TODO: Create water visualization material?
  observe(world, onAdd(WaterSimulation), (eid) => {
    const [waterHeightmapEid] = query(world, [TextureRef, WaterHeightmapOf(eid)]);
    const waterHeightmap = getTexture(TextureRef.ref[waterHeightmapEid]);

    const [velocityMapEid] = query(world, [TextureRef, VelocityMapOf(eid)]);
    const velocityMap = getTexture(TextureRef.ref[velocityMapEid]);

    const { materialId } = createWaterVisualizationMaterial(waterHeightmap, velocityMap);
    MaterialRef.ref[eid] = materialId;

    const [terrainEid] = query(world, [MeshRef, Terrain]);
    MaterialRef.ref[terrainEid] = materialId;
  });
};
