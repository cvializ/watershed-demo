import type { WorldSystem } from "@/world/types";

import { rotationSystem } from "@/world/systems/rotation";
import { velocitySystem } from "@/world/systems/velocity";

export const worldSyncSystem: WorldSystem = (world, dt) => {
  velocitySystem(world, dt);
  rotationSystem(world, dt);
};
