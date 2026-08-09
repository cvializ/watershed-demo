import type { RendererSystem } from "@/renderer/types";

import { updateControls } from "@/renderer/resources/camera";
import { simulationSystem } from "@/renderer/systems/simulation";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";

export const rendererSyncSystem: RendererSystem = (
  world,
  scene,
  renderer,
  dt,
) => {
  simulationSystem(world, scene, renderer, dt);

  // Update terrain painting system
  const terrainPaintingManager = getTerrainPaintingManager();
  if (terrainPaintingManager) {
    terrainPaintingManager.update();
  }

  // Update camera controls (auto-rotate and input handling)
  updateControls(dt);

  const camera = getObject(GeneralObjectEnum.Camera);
  renderer.render(scene, camera);
};
