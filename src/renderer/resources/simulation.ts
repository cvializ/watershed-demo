import * as THREE from "three";

import { createCloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { createGpuWaterFlowSimulation } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import { MeshEnum, setMesh } from "@/scene/resources/mesh";
import { setTexture, TextureEnum } from "@/scene/resources/texture";
import { createDisplacementTextureResource } from "@/scene/resources/textures/displacement";
import { logger } from "@/utils/logger";

const SIM_SIZE = 512;
const terrainSize = 12;

export const createSimulationResource = (renderer: THREE.WebGLRenderer) => {
  logger.info("[simulation:create]");

  const waterSimulation = createGpuWaterFlowSimulation(
    SIM_SIZE,
    terrainSize,
    renderer,
    createDisplacementTextureResource(512, 12),
  );

  const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
  setTexture(TextureEnum.CloudShadowMap, cloudShadowTexture);

  const velocityTexture = waterSimulation.getVelocityTexture();
  setTexture(TextureEnum.VelocityMap, velocityTexture);

  const simulationTexture = waterSimulation.getSimulationTexture();
  setTexture(TextureEnum.WaterHeightMap, simulationTexture);

  // Get testing texture from GPU simulation
  const testingTexture = waterSimulation.getTestingTexture();
  setTexture(TextureEnum.TestingTexture, testingTexture);

  // Create cloud sphere system using the cloud texture from GPU simulation
  const cloudTexture = waterSimulation.getCloudShadowTexture();
  const cloudSphereSystem = createCloudSphereSystem(renderer, cloudTexture);

  // Store cloud mesh in cache for type-safe access
  const cloudMesh = cloudSphereSystem.getMesh();
  if (cloudMesh) {
    setMesh(MeshEnum.CloudMesh, cloudMesh);
  }

  return { waterSimulation, cloudSphereSystem };
};
