import type { SceneInitSystem } from "@/scene/types";

import { hiddenInitSystem } from "@/scene/systems/hidden";
import { cameraInitSystem } from "@/scene/systems/init/camera";
import { refsInitSystem } from "@/scene/systems/init/refs";
import { initWaterSimulation } from "@/scene/systems/init/waterSimulation";
import { wireframeInitSystem } from "@/scene/systems/init/wireframe";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  hiddenInitSystem(world, scene);

  refsInitSystem(world, scene);
  wireframeInitSystem(world, scene);
  initWaterSimulation(world, scene);

  cameraInitSystem(world, scene);
};
