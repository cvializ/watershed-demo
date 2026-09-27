import type { World } from "bitecs";

import { TERRAIN_SIZE } from "@/terrain/constants";
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

  const x = options.x ?? Math.random() * TERRAIN_SIZE - TERRAIN_SIZE / 2;
  const y = options.y ?? 0.5; // Default height to sit on terrain surface
  const z = options.z ?? Math.random() * TERRAIN_SIZE - TERRAIN_SIZE / 2;

  return createAnimal(world, x, y, z);
};
