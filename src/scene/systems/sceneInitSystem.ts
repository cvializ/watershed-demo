import type { SceneInitSystem } from "@/scene/types";

import { initSceneMaterialResources } from "@/scene/resources/material";
import { initMeshes } from "@/scene/resources/mesh";
import { initTextures } from "@/scene/resources/texture";
import { cameraInitSystem } from "@/scene/systems/init/camera";
import { hiddenInitSystem } from "@/scene/systems/init/hidden";
import { waterSimulationInitSystem } from "@/scene/systems/init/waterSimulation";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  initTextures();
  initSceneMaterialResources();
  initMeshes(world, scene);

  hiddenInitSystem(world, scene);

  waterSimulationInitSystem(world, scene);

  cameraInitSystem(world, scene);
};
