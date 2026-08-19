import type { World } from "bitecs";

import { createAnimal } from "@/world/factories/animal";

/**
 * Options for creating an animal on the terrain.
 */
export type AnimalOptions = {
  /** X position in world space (default: random position on terrain) */
  x?: number;

  /** Y position (height above ground, default: 0.5 to sit on terrain) */
  y?: number;

  /** Z position in world space (default: random position on terrain) */
  z?: number;
};

/**
 * Add an animal entity to the world at a specified position on the terrain.
 *
 * @param world - The ECS world
 * @param options - Animal creation options
 * @returns The entity ID of the created animal
 */
export const addAnimal = (
  world: World,
  options: AnimalOptions = {},
): number => {
  const terrainSize = 12; // Match the terrain size

  const x = options.x ?? Math.random() * terrainSize - terrainSize / 2;
  const y = options.y ?? 0.5; // Default height to sit on terrain surface
  const z = options.z ?? Math.random() * terrainSize - terrainSize / 2;

  return createAnimal(world, x, y, z);
};
