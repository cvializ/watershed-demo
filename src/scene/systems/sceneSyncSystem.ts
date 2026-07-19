import type { SceneSystem } from "@/scene/types";

import { updateControls } from "@/scene/systems/init/camera";
import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { visualizationSystem } from "@/scene/systems/visualization";

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  visualizationSystem(world, scene, dt);

  updateControls(dt);
};
