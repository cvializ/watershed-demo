import type { ShaderMaterial } from "three";

import { query } from "bitecs";
import * as THREE from "three";

import type { RendererSystem } from "@/renderer/types";

import { WaterSimulation as WaterSimulationComponent } from "@/components/components";
import { getGameClock } from "@/renderer/resources/loop";
import {
  cloudSphereSystem,
  waterSimulation,
} from "@/renderer/systems/init/simulation";
import {
  getMaterial,
  MaterialEnum,
  type PulsingVisualizationUniforms,
  type WaterVisualizationUniforms,
} from "@/scene/resources/material";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

export const simulationSystem: RendererSystem = (
  world,
  scene,
  renderer,
  dt,
) => {
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

  const [simulation$] = query(world, [WaterSimulationComponent]);
  const simulationExists = Boolean(simulation$);
  if (!simulationExists) {
    logger.warn("[simulation:skip] WaterSimulationComponent entity not found");
    return;
  }

  logger.debug(
    { simulation$ },
    "[simulation:entity] WaterSimulationComponent entity found",
  );

  const { showVelocity } = world;
  const material = getMaterial(MaterialEnum.WaterFlow) as ShaderMaterial;

  // Check if this is a pulsing simulation material
  const isPulsingMaterial = world.visualizationMode === 6;

  if (isPulsingMaterial) {
    logger.debug("[simulation:pulsing] Using PulsingSimulation material");
    // Update pulsing simulation texture
    const uniform = getUniforms<PulsingVisualizationUniforms>(material);
    const pulsingTexture = waterSimulation.getPulsingTexture();
    uniform.uPulsingTexture = { value: pulsingTexture };
  } else {
    // Update water visualization uniforms
    const uniforms = getUniforms<WaterVisualizationUniforms>(material);
    uniforms.uShowVelocity.value = showVelocity ? 1 : 0;
    uniforms.uLightPosition.value.x = world.sunPosition.x;
    uniforms.uLightPosition.value.y = world.sunPosition.y;
    uniforms.uLightPosition.value.z = world.sunPosition.z;
  }

  waterSimulation.compute(dt, gameTime);

  // Update cloud spheres if available
  if (cloudSphereSystem) {
    const camera =
      (renderer as any).getCurrentViewportCamera ||
      scene.children.find((c: THREE.Object3D) => (c as any).isCamera);
    if (camera) {
      cloudSphereSystem.update(camera, dt);

      // Add cloud sphere mesh to scene if not already added
      const cloudMesh = cloudSphereSystem.getMesh();

      // Check if mesh is already in scene
      const existingCloudMesh = scene.getObjectByName("volumetric-clouds");
      if (!existingCloudMesh && cloudMesh) {
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
