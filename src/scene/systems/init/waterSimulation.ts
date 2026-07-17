import { observe, onAdd, type World } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import {
  CloudShadowMapOf,
  Default,
  HeightMap,
  MaterialRef,
  TextureRef,
  VelocityMapOf,
  WaterHeightmapOf,
  WaterSimulation,
} from "@/components/components";
import { createWaterVisualizationMaterialResource } from "@/scene/resources/material";
import { getTexture } from "@/scene/resources/texture";

export const waterSimulationInitSystem: SceneInitSystem = (world: World, scene: THREE.Scene) => {
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

    // Get the sun light from scene
    const sunLight = scene.getObjectByName("sun-light") as THREE.DirectionalLight;
    if (!sunLight) {
      console.error("Sun light not found in scene");
      return;
    }

    const { materialId } = createWaterVisualizationMaterialResource({
      heightmap,
      waterHeightMap,
      cloudShadowMap,
      velocityMap,
      sunLight,
    });
    MaterialRef.ref[entity$] = materialId;
  });
};
