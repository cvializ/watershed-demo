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
  Wireframe,
} from "@/components/components";
import { createCameraResource } from "@/scene/resources/camera";
import {
  createDefaultMaterialResource,
  createWaterVisualizationMaterialResource,
} from "@/scene/resources/material";
import { createTerrainResource } from "@/scene/resources/terrain";
import { createDefaultHeightMapTextureResource, getTexture } from "@/scene/resources/texture";
import { createWireframeResource } from "@/scene/resources/wireframe";
import { getCamera } from "@/scene/sceneUtils";
import { hiddenInitSystem } from "@/scene/systems/hidden";

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

export const sceneInitSystem = (world: World, scene: THREE.Scene): void => {
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

  observe(world, onAdd(WaterSimulation), (entity$) => {
    // Query for the heightmap textures populated by the simulation
    // to generate the visualization shader material.
    // This doesn't need to be a sync because the texture reference updates in place

    // TODO: queries directory

    const [heightmapEntity$] = query(world, [Default, HeightMap, TextureRef]);
    const heightmap = getTexture(TextureRef.ref[heightmapEntity$]);

    const [waterHeightmapEid$] = query(world, [TextureRef, WaterHeightmapOf(entity$)]);
    const waterHeightMap = getTexture(TextureRef.ref[waterHeightmapEid$]);

    const [cloudShadowMapEid$] = query(world, [TextureRef, CloudShadowMapOf(entity$)]);
    const cloudShadowMap = getTexture(TextureRef.ref[cloudShadowMapEid$]);

    const [velocityMapEid$] = query(world, [TextureRef, VelocityMapOf(entity$)]);
    const velocityMap = getTexture(TextureRef.ref[velocityMapEid$]);

    if (!heightmap || !waterHeightMap || !cloudShadowMap || !velocityMap) {
      console.error("missing simulation textures");
      return;
    }

    const { materialId } = createWaterVisualizationMaterialResource({
      heightmap,
      waterHeightMap,
      cloudShadowMap,
      velocityMap,
    });
    MaterialRef.ref[entity$] = materialId;
  });

  hiddenInitSystem(world, scene);
};
