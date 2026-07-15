import { query, type World } from "bitecs";

import type { WorldSystem } from "@/world/types";

import { Position, Velocity } from "@/components/components";

export const velocitySystem: WorldSystem = (world: World, dt: number): void => {
  const entities$ = query(world, [Position, Velocity]);

  for (const entity$ of entities$) {
    Position.x[entity$] += Velocity.x[entity$] * dt;
    Position.y[entity$] += Velocity.y[entity$] * dt;
  }
};
