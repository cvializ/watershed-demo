import type { SceneInitSystem } from "@/scene/types";

import { cameraInitSystem } from "@/scene/systems/init/camera";
import { hiddenInitSystem } from "@/scene/systems/init/hidden";
import { refsInitSystem } from "@/scene/systems/init/refs";
import { visualizationInitSystem } from "@/scene/systems/init/visualization";
import { waterSimulationInitSystem } from "@/scene/systems/init/waterSimulation";
import { wireframeInitSystem } from "@/scene/systems/init/wireframe";

export const sceneInitSystem: SceneInitSystem = (world, scene): void => {
  hiddenInitSystem(world, scene);

  refsInitSystem(world, scene);
  wireframeInitSystem(world, scene);
  waterSimulationInitSystem(world, scene);

  cameraInitSystem(world, scene);

  visualizationInitSystem(world, scene);
};
