import { observe, onAdd, query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

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
import { createTexture } from "@/world/factories/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

export let waterSimulation: WaterFlowVisualization | null = null;

export const simulationInitSystem: RendererInitSystem = (world, _scene, renderer) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    const [heightMapEntity$] = query(world, [Default, HeightMap, TextureRef]);
    const textureId = TextureRef.ref[heightMapEntity$];
    const texture = getTexture(textureId) as THREE.DataTexture;

    waterSimulation = createGpuWaterFlowSimulation(SIM_SIZE, terrainSize, renderer, texture);

    const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
    const cloudShadowTextureId = cloudShadowTexture.id;
    registerTextureResource(cloudShadowTextureId, cloudShadowTexture);
    createTexture(world, cloudShadowTextureId, CloudShadowMapOf(entity$));

    const velocityTexture = waterSimulation.getVelocityTexture();
    const velocityTextureId = velocityTexture.id;
    registerTextureResource(velocityTextureId, velocityTexture);
    createTexture(world, velocityTextureId, VelocityMapOf(entity$));

    const simulationTexture = waterSimulation.getSimulationTexture();
    const simulationTextureId = simulationTexture.id;
    registerTextureResource(simulationTextureId, simulationTexture);
    createTexture(world, simulationTextureId, WaterHeightmapOf(entity$));
  });
};
