import type { SceneSystem } from "@/scene/types";

import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunOrbitSystem } from "@/scene/systems/sunOrbit";

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunOrbitSystem(world, scene, dt);
};
