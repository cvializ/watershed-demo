import type { WorldInitSystem } from "@/world/types";

import { logger } from "@/utils/logger";
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
};
