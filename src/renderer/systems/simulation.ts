import type { ShaderMaterial } from "three";

import * as THREE from "three";

import type { SedimentFlowUniforms } from "@/gpu/waterFlowSimulation/variables/createGpuSedimentFlow";
import type { RendererSystem } from "@/renderer/types";

import { getGameClock } from "@/renderer/resources/loop";
import {
  cloudSphereSystem,
  waterSimulation,
} from "@/renderer/systems/init/simulation";
import {
  getMaterial,
  MaterialEnum,
  type TestingVisualizationUniforms,
  type WaterVisualizationUniforms,
} from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { getTexture, setTexture, TextureEnum } from "@/scene/resources/texture";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export const simulationSystem: RendererSystem = (
  world,
  scene,
  _renderer,
  dt,
) => {
  // Skip updates when game is paused
  if (world.isPaused) {
    return;
  }

  if (!waterSimulation) {
    logger.warn("[simulation:skip] waterSimulation not initialized");
    return;
  }

  const clock = getGameClock();
  const gameTime = clock ? clock.getTime() : 0;

  logger.debug(
    { gameTime },
    "[simulation:gameTime] Current game time from clock",
  );

  const { showVelocity } = world;
  const material = getMaterial(MaterialEnum.WaterFlow) as ShaderMaterial;

  // Check if this is a testing simulation material
  const isTestingMaterial = world.visualizationMode === 6;

  if (isTestingMaterial) {
    logger.debug("[simulation:testing] Using TestingSimulation material");
    const testingMaterial = getMaterial(
      MaterialEnum.TestingSimulation,
    ) as ShaderMaterial;
    const uniform = getUniforms<TestingVisualizationUniforms>(testingMaterial);
    const testingTexture = waterSimulation.getTestingTexture();
    uniform.uTestingTexture.value = testingTexture;
  } else {
    // Update water visualization uniforms
    const uniforms = getUniforms<WaterVisualizationUniforms>(material);
    uniforms.uShowVelocity.value = showVelocity ? 1 : 0;
    uniforms.uLightPosition.value.x = world.sunPosition.x;
    uniforms.uLightPosition.value.y = world.sunPosition.y;
    uniforms.uLightPosition.value.z = world.sunPosition.z;
  }

  // Update sediment flow erosion rate from world state
  const sedimentUniforms = getUniforms<SedimentFlowUniforms>(
    waterSimulation.getSedimentFlowVariable().material,
  );
  sedimentUniforms.erosionRate.value = world.erosionRate;

  waterSimulation.compute(dt, gameTime);

  // Update water visualization with dynamic height map (modified by sediment) and all simulation textures
  const dynamicHeightMap = waterSimulation.getDynamicHeightMapTexture();
  setTexture(TextureEnum.HeightMap, dynamicHeightMap);

  const waterUniforms = getUniforms<WaterVisualizationUniforms>(material);
  waterUniforms.uHeightMap.value = dynamicHeightMap;
  // Update all simulation textures that were not available at material init time
  waterUniforms.uWaterHeightmap.value = waterSimulation.getSimulationTexture();
  waterUniforms.uCloudShadowMap.value = waterSimulation.getCloudShadowTexture();
  waterUniforms.uVelocityMap.value = waterSimulation.getVelocityTexture();

  // Update surface material map (shared texture used for both visualization and simulation)
  const surfaceMaterialTexture = getTexture(TextureEnum.SurfaceMaterialMap);
  if (surfaceMaterialTexture) {
    waterUniforms.uSurfaceMaterialMap.value = surfaceMaterialTexture;
  }

  // Also update other materials that use the height map for displacement
  const heightVizMaterial = getMaterial(
    MaterialEnum.HeightVisualization,
  ) as ShaderMaterial;
  if (heightVizMaterial.uniforms.uHeightMap) {
    heightVizMaterial.uniforms.uHeightMap.value = dynamicHeightMap;
  }

  const slopeMaterial = getMaterial(MaterialEnum.Slope) as ShaderMaterial;
  if (slopeMaterial.uniforms.uHeightMap) {
    slopeMaterial.uniforms.uHeightMap.value = dynamicHeightMap;
  }

  // Update cloud spheres if available
  if (cloudSphereSystem) {
    const camera = scene.children.find(
      (c: THREE.Object3D) => (c as THREE.Camera).isCamera,
    ) as THREE.Camera;
    if (camera) {
      cloudSphereSystem.update(camera, dt);

      // Add cloud sphere mesh to scene if not already added
      const cloudMesh = getMesh(MeshEnum.CloudMesh);

      // Check if mesh is already in scene by checking its parent
      if (!cloudMesh.parent) {
        logger.info("Adding volumetric clouds to scene");
        cloudMesh.name = "volumetric-clouds";
        scene.add(cloudMesh);
      }
    } else {
      logger.warn("Camera not found for clouds");
    }
  } else {
    logger.warn("Cloud sphere system not initialized");
  }
};
