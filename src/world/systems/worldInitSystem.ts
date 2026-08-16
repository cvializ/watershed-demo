import type { WorldInitSystem } from "@/world/types";

import { logger } from "@/utils/logger";
import { addAnimal } from "@/world/factories/addAnimal";
import { createCamera } from "@/world/factories/camera";
import { createDownslopeArrows } from "@/world/factories/downslopeArrows";
import { createSunLight } from "@/world/factories/sunLight";
import { createSunSphere } from "@/world/factories/sunSphere";
import { createTerrain } from "@/world/factories/terrain";

export const worldInitSystem: WorldInitSystem = (world) => {
  logger.info("[world:init]");

  createTerrain(world);
  createCamera(world);
  createSunLight(world);
  createSunSphere(world);
  createDownslopeArrows(world);

  // Add an animal at a specific position
  addAnimal(world, { x: 2.0, y: 0.5, z: -3.0 });

  // Add an animal at a random position
  addAnimal(world);

  // Add multiple animals
  addAnimal(world, { x: -4.0, y: 0.5, z: 2.0 });
  addAnimal(world, { x: 3.0, y: 0.5, z: -4.0 });
};
