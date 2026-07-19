import type { RendererSystem } from "@/renderer/types";

import { simulationSystem } from "@/renderer/systems/simulation";
import { getCamera } from "@/scene/sceneUtils";

export const rendererSyncSystem: RendererSystem = (world, scene, renderer, dt) => {
  simulationSystem(world, scene, renderer, dt);

  const camera = getCamera(scene);
  if (!camera) {
    console.log("no camera in scene");
    return;
  }

  renderer.render(scene, camera);
};
