import * as THREE from "three";

import { createCloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { createGpuWaterFlowSimulation } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import { MeshEnum, setMesh } from "@/scene/resources/mesh";
import { setTexture, TextureEnum } from "@/scene/resources/texture";
import { createDisplacementTextureResource } from "@/scene/resources/textures/displacement";
import { createSurfaceMaterialTexture, type SurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";
import { logger } from "@/utils/logger";

const SIM_SIZE = 512;
const terrainSize = 12;

export const createSimulationResource = (renderer: THREE.WebGLRenderer): {
  waterSimulation: ReturnType<typeof createGpuWaterFlowSimulation>;
  cloudSphereSystem: ReturnType<typeof createCloudSphereSystem>;
  surfaceMaterialTexture: SurfaceMaterialTexture;
} => {
  logger.info("[simulation:create]");

  // Create surface material texture for terrain painting
  const surfaceMaterialTexture = createSurfaceMaterialTexture(SIM_SIZE, terrainSize);
  const surfaceMaterialMap = surfaceMaterialTexture.getTexture();
  setTexture(TextureEnum.SurfaceMaterialMap, surfaceMaterialMap);

  const waterSimulation = createGpuWaterFlowSimulation(
    SIM_SIZE,
    terrainSize,
    renderer,
    createDisplacementTextureResource(512, 12),
    surfaceMaterialMap,
  );

  const cloudShadowTexture = waterSimulation.getCloudShadowTexture();
  setTexture(TextureEnum.CloudShadowMap, cloudShadowTexture);

  const velocityTexture = waterSimulation.getVelocityTexture();
  setTexture(TextureEnum.VelocityMap, velocityTexture);

  const simulationTexture = waterSimulation.getSimulationTexture();
  setTexture(TextureEnum.WaterHeightMap, simulationTexture);

  // Get sediment flow texture from GPU simulation
  const sedimentFlowTexture = waterSimulation.getSedimentFlowTexture();
  setTexture(TextureEnum.SedimentFlowMap, sedimentFlowTexture);

  // Get testing texture from GPU simulation
  const testingTexture = waterSimulation.getTestingTexture();
  setTexture(TextureEnum.TestingTexture, testingTexture);

  // Get dynamic height map texture (modified by sediment erosion/deposition)
  const dynamicHeightMapTexture = waterSimulation.getDynamicHeightMapTexture();
  setTexture(TextureEnum.HeightMap, dynamicHeightMapTexture);

  // Create cloud sphere system using the cloud texture from GPU simulation
  const cloudTexture = waterSimulation.getCloudShadowTexture();
  const cloudSphereSystem = createCloudSphereSystem(renderer, cloudTexture);

  // Store cloud mesh in cache for type-safe access
  const cloudMesh = cloudSphereSystem.getMesh();
  if (cloudMesh) {
    setMesh(MeshEnum.CloudMesh, cloudMesh);
  }

  return { waterSimulation, cloudSphereSystem, surfaceMaterialTexture };
};
