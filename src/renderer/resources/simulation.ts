import * as THREE from "three";

import { createCloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { createGpuWaterFlowSimulation } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import {
  createDisplacementTexture,
  setTexture,
  TextureEnum,
} from "@/scene/resources/texture";
import { logger } from "@/utils/logger";

const SIM_SIZE = 512;
const terrainSize = 12;

export const createSimulationResource = (renderer: THREE.WebGLRenderer) => {
  logger.info("[simulation:create]");

  const waterSimulation = createGpuWaterFlowSimulation(
    SIM_SIZE,
    terrainSize,
    renderer,
    createDisplacementTexture(512, 12),
  );

  const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
  setTexture(TextureEnum.CloudShadowMap, cloudShadowTexture);

  const velocityTexture = waterSimulation.getVelocityTexture();
  setTexture(TextureEnum.VelocityMap, velocityTexture);

  const simulationTexture = waterSimulation.getSimulationTexture();
  setTexture(TextureEnum.WaterHeightMap, simulationTexture);

  // Get pulsing texture from GPU simulation
  const pulsingTexture = waterSimulation.getPulsingTexture();
  setTexture(TextureEnum.PulsingTexture, pulsingTexture);

  // Create cloud sphere system using the cloud texture from GPU simulation
  const cloudTexture = waterSimulation.getCloudShadowTexture();
  const cloudSphereSystem = createCloudSphereSystem(renderer, cloudTexture);

  return { waterSimulation, cloudSphereSystem };
};
