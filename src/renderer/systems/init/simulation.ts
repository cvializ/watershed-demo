import { observe, onAdd, onRemove } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { WaterSimulation } from "@/components/components";
import { createCloudSphereSystem, type CloudSphereSystem } from "@/gpu/createCloudSphereSystem";
import {
  createGpuWaterFlowSimulation,
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { getTexture, setTexture, TextureEnum } from "@/scene/resources/texture";

const SIM_SIZE = 512;
const terrainSize = 12;

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;

export const simulationInitSystem: RendererInitSystem = (world, _scene, renderer) => {
  observe(world, onAdd(WaterSimulation), () => {
    const heightMapTexture = getTexture(TextureEnum.DefaultHeightMap) as THREE.DataTexture;

    console.log("createGpuWaterFlowSimulation");

    waterSimulation = createGpuWaterFlowSimulation(
      SIM_SIZE,
      terrainSize,
      renderer,
      heightMapTexture,
    );

    const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
    setTexture(TextureEnum.CloudShadowMap, cloudShadowTexture);

    const velocityTexture = waterSimulation.getVelocityTexture();
    setTexture(TextureEnum.VelocityMap, velocityTexture);

    const simulationTexture = waterSimulation.getSimulationTexture();
    setTexture(TextureEnum.WaterHeightMap, simulationTexture);

    // Create cloud sphere system using the cloud texture from GPU simulation
    const cloudTexture = waterSimulation.getCloudShadowTexture();
    if (cloudTexture) {
      cloudSphereSystem = createCloudSphereSystem(renderer, cloudTexture);
    }
  });

  observe(world, onRemove(WaterSimulation), () => {
    waterSimulation = null;
  });
};
