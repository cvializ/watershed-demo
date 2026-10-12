import type { WorldInitSystem } from "@/world/types";

import { logger } from "@/utils/logger";
import { addAnimal } from "@/world/factories/addAnimal";
import { createCamera } from "@/world/factories/camera";
import { createDownslopeArrows } from "@/world/factories/downslopeArrows";
import { createStarfield } from "@/world/factories/starfield";
import { createSunLight } from "@/world/factories/sunLight";
import { createSunSphere } from "@/world/factories/sunSphere";
import { createTerrain } from "@/world/factories/terrain";
import { createViewpoint } from "@/world/factories/viewpoint";

export const worldInitSystem: WorldInitSystem = (world) => {
  logger.info("[world:init]");

  createTerrain(world);
  createCamera(world);
  createSunLight(world);
  createSunSphere(world);
  createDownslopeArrows(world);
  createStarfield(world);

  // Add an animal at a specific position
  addAnimal(world, { x: 2.0, y: 0.5, z: -3.0 });

  // Add an animal at a random position
  addAnimal(world);

  // Add multiple animals
  addAnimal(world, { x: -4.0, y: 0.5, z: 2.0 });
  addAnimal(world, { x: 3.0, y: 0.5, z: -4.0 });

  // Seed a few first-person viewpoints around the terrain so the Viewpoints UI
  // has something to pick from out of the box. None is active by default, so
  // the scene still opens on the overhead orbit view.
  createViewpoint(world, {
    stand: { x: 12, z: 12 },
    look: { x: 0, z: 0 },
    name: "South-east overlook",
  });
  createViewpoint(world, {
    stand: { x: -14, z: 6 },
    look: { x: 0, z: 0 },
    name: "West ridge",
  });
  createViewpoint(world, {
    stand: { x: 6, z: -15 },
    look: { x: 0, z: 0 },
    name: "North clearing",
  });
};
