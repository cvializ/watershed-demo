import { query, type World } from "bitecs";

import type { WorldSystem } from "@/world/types";

import { Rotate, Transform } from "@/components/components";

export const rotationSystem: WorldSystem = (world: World, dt: number): void => {
  const entities = query(world, [Transform, Rotate]);

  for (const entity$ of entities) {
    Transform.rx[entity$] += 0.6 * dt; // ~34 deg/s around X
    Transform.ry[entity$] += 1.2 * dt; // ~69 deg/s around Y
  }
};
