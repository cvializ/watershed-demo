import { observe, onAdd, query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import {
  WaterSimulation,
  WaterHeightmapOf,
  CloudShadowMapOf,
  VelocityMapOf,
} from "@/components/components";
import { createCloudSphereSystem, type CloudSphereSystem } from "@/gpu/createCloudSphereSystem";
import {
  createGpuWaterFlowSimulation,
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { createTexture } from "@/scene/factories/texture";
import { getTextureEnum, setTextureEnum, TextureEnum } from "@/scene/resources/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;

export const simulationInitSystem: RendererInitSystem = (world, _scene, renderer) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    const heightMapTexture = getTextureEnum(TextureEnum.DefaultHeightMap) as THREE.DataTexture;

    console.log("createGpuWaterFlowSimulation");

    waterSimulation = createGpuWaterFlowSimulation(
      SIM_SIZE,
      terrainSize,
      renderer,
      heightMapTexture,
    );

    const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
    setTextureEnum(TextureEnum.CloudShadowMap, cloudShadowTexture);
    createTexture(world, TextureEnum.CloudShadowMap, CloudShadowMapOf(entity$));

    const velocityTexture = waterSimulation.getVelocityTexture();
    setTextureEnum(TextureEnum.VelocityMap, velocityTexture);
    createTexture(world, TextureEnum.VelocityMap, VelocityMapOf(entity$));

    const simulationTexture = waterSimulation.getSimulationTexture();
    setTextureEnum(TextureEnum.WaterHeightMap, simulationTexture);
    createTexture(world, TextureEnum.Simulation, WaterHeightmapOf(entity$));

    // Create cloud sphere system using the cloud texture from GPU simulation
    const cloudTexture = waterSimulation.getCloudShadowTexture();
    if (cloudTexture) {
      cloudSphereSystem = createCloudSphereSystem(renderer, cloudTexture);
    }
  });
};
