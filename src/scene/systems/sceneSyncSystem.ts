import type { SceneSystem } from "@/scene/types";

import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { syncVisualizationSystem } from "@/scene/systems/visualization";

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  syncVisualizationSystem(world, scene, dt);
};
