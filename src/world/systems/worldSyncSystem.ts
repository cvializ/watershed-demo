import type { WorldSystem } from "@/world/types";

import { rotationSystem } from "@/world/systems/rotation";
import { velocitySystem } from "@/world/systems/velocity";

const timeSyncSystem: WorldSystem = (world, dt) => {
  world.time += dt;
};

export const worldSyncSystem: WorldSystem = (world, dt) => {
  velocitySystem(world, dt);
  rotationSystem(world, dt);
  timeSyncSystem(world, dt);
};
