import type { RendererSystem } from "@/renderer/types";

import { updateControls } from "@/renderer/systems/init/camera";
import { simulationSystem } from "@/renderer/systems/simulation";
import { getCamera } from "@/scene/sceneUtils";
import { logger } from "@/utils/logger";

export const rendererSyncSystem: RendererSystem = (
  world,
  scene,
  renderer,
  dt,
) => {
  simulationSystem(world, scene, renderer, dt);

  // Update camera controls (auto-rotate and input handling)
  updateControls(dt);

  const camera = getCamera(scene);
  if (!camera) {
    logger.warn("no camera in scene");
    return;
  }
  renderer.render(scene, camera);
};
