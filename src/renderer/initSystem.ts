import { observe, onAdd, query } from "bitecs";
// Create water flow simulation
import * as THREE from "three";

import type { RendererInitSystem, RendererSystem } from "@/renderer/types";

import {
  WaterSimulation,
  Default,
  HeightMap,
  TextureRef,
  WaterHeightmapOf,
  CloudShadowMapOf,
  VelocityMapOf,
} from "@/components/components";
import {
  createGpuWaterFlowSimulation,
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { getTexture, registerTextureResource } from "@/scene/resources/texture";
import { getCamera } from "@/scene/sceneUtils";
import { createTexture } from "@/world/factories/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

let waterSimulation: WaterFlowVisualization | null = null;

export const rendererInitSystem: RendererInitSystem = (world, scene, renderer) => {
  observe(world, onAdd(WaterSimulation), (eid) => {
    const [heightMapEid] = query(world, [Default, HeightMap, TextureRef]);
    const textureId = TextureRef.ref[heightMapEid];
    const texture = getTexture(textureId) as THREE.DataTexture;

    waterSimulation = createGpuWaterFlowSimulation(SIM_SIZE, terrainSize, renderer, texture);

    const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
    const cloudShadowTextureId = cloudShadowTexture.id;
    registerTextureResource(cloudShadowTextureId, cloudShadowTexture);
    createTexture(world, cloudShadowTextureId, CloudShadowMapOf(eid));

    const velocityTexture = waterSimulation.getVelocityTexture();
    const velocityTextureId = velocityTexture.id;
    registerTextureResource(velocityTextureId, velocityTexture);
    createTexture(world, velocityTextureId, VelocityMapOf(eid));

    const simulationTexture = waterSimulation.getSimulationTexture();
    const simulationTextureId = simulationTexture.id;
    registerTextureResource(simulationTextureId, simulationTexture);
    createTexture(world, simulationTextureId, WaterHeightmapOf(eid));

    console.log("render init system");
  });

  // // Handle window resize
  // window.addEventListener("resize", () => {
  //   const aspect = window.innerWidth / window.innerHeight;
  //   camera.left = (frustumSize * aspect) / -2;
  //   camera.right = (frustumSize * aspect) / 2;
  //   camera.top = frustumSize / 2;
  //   camera.bottom = frustumSize / -2;
  //   camera.updateProjectionMatrix();
  //   renderer.setSize(window.innerWidth, window.innerHeight);
  // });
};

export const rendererSyncSystem: RendererSystem = (_world, _scene, _renderer, _dt) => {
  if (!waterSimulation) {
    return;
  }

  waterSimulation.compute(1 / 60);
};
