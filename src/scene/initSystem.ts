import { observe, onAdd, type World } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import {
  Camera,
  CloudShadowMapOf,
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
  if (!eid) {
    throw new Error("camera not found in components");
  }

  const camera = getCamera(scene);
  if (!camera) {
    throw new Error("camera not found in scene");
  }

  const [terrainEid] = query(world, [Terrain, MeshRef]);
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

  observe(world, onAdd(WaterSimulation), (eid) => {
    // Query for the heightmap textures populated by the simulation
    // to generate the visualization shader material.
    // This doesn't need to be a sync because the texture reference updates in place
    const [heightmapEid] = query(world, [Default, HeightMap, TextureRef]);
    const heightmap = getTexture(TextureRef.ref[heightmapEid]);

    const [waterHeightmapEid] = query(world, [TextureRef, WaterHeightmapOf(eid)]);
    const waterHeightMap = getTexture(TextureRef.ref[waterHeightmapEid]);

    const [cloudShadowMapEid] = query(world, [TextureRef, CloudShadowMapOf(eid)]);
    const cloudShadowMap = getTexture(TextureRef.ref[cloudShadowMapEid]);

    const [velocityMapEid] = query(world, [TextureRef, VelocityMapOf(eid)]);
    const velocityMap = getTexture(TextureRef.ref[velocityMapEid]);

    if (!heightmap || !waterHeightMap || !cloudShadowMap || !velocityMap) {
      return;
    }

    const { materialId } = createWaterVisualizationMaterial({
      heightmap,
      waterHeightMap,
      cloudShadowMap,
      velocityMap,
    });
    MaterialRef.ref[eid] = materialId;

    const [terrainEid] = query(world, [MeshRef, Terrain]);
    MaterialRef.ref[terrainEid] = materialId;
  });
};
