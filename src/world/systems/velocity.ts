import { query, type World } from "bitecs";

import type { WorldSystem } from "@/world/types";

import { Position, Velocity } from "@/components/components";

export const velocitySystem: WorldSystem = (world: World, dt: number): void => {
  const entities = query(world, [Position, Velocity]);

  for (const eid of entities) {
    Position.x[eid] += Velocity.x[eid] * dt;
    Position.y[eid] += Velocity.y[eid] * dt;
  }
};
