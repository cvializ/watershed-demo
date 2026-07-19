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

export const waterSimulationInitSystem: SceneInitSystem = (world, scene) => {
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

    const waterFlowMaterial = createWaterVisualizationMaterialResource({
      heightmap,
      waterHeightMap,
      cloudShadowMap,
      velocityMap,
      sunLightPosition: new THREE.Vector3(
        world.sunPosition.x,
        world.sunPosition.y,
        world.sunPosition.z,
      ),
    });
    setMaterial(MaterialEnum.WaterFlow, waterFlowMaterial);
    MaterialRef.ref[entity$] = MaterialEnum.WaterFlow;
  });
};
