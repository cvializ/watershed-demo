import { observe, onAdd, type World } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MaterialRef, WaterSimulation } from "@/components/components";
import {
  createWaterVisualizationMaterialResource,
  MaterialEnum,
  setMaterial,
} from "@/scene/resources/material";
import { getTexture, TextureEnum } from "@/scene/resources/texture";

export const waterSimulationInitSystem: SceneInitSystem = (world: World, scene: THREE.Scene) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    console.log("ON ADD SIMULATION");

    const heightmap = getTexture(TextureEnum.DefaultHeightMap);

    const waterHeightMap = getTexture(TextureEnum.WaterHeightMap);

    const cloudShadowMap = getTexture(TextureEnum.CloudShadowMap);

    const velocityMap = getTexture(TextureEnum.VelocityMap);

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

    const waterFlowMaterial = createWaterVisualizationMaterialResource({
      heightmap,
      waterHeightMap,
      cloudShadowMap,
      velocityMap,
      sunLight,
    });
    setMaterial(MaterialEnum.WaterFlow, waterFlowMaterial);
    MaterialRef.ref[entity$] = MaterialEnum.WaterFlow;
  });
};
