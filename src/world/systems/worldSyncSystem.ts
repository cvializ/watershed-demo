import type { WorldSystem } from "@/world/types";

import { fpsSystem } from "@/world/systems/fps";

export const worldSyncSystem: WorldSystem = (world, dt) => {
  fpsSystem(world, dt);
};
