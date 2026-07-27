import { query } from "bitecs";

import type { WorldSystem } from "@/world/types";

import { Camera, Position } from "@/components/components";
import { fpsSystem } from "@/world/systems/fps";
import { rotationSystem } from "@/world/systems/rotation";

export const worldSyncSystem: WorldSystem = (world, dt) => {
  fpsSystem(world, dt);
  rotationSystem(world, dt);

  const [entity$] = query(world, [Camera]);
  Position.x[entity$] = 0;
  Position.y[entity$] = 0;
  Position.z[entity$] = 0;
};
