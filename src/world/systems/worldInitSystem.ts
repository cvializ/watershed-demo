import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/world/factories/camera";
import { createDownslopeArrows } from "@/world/factories/downslopeArrows";
import { createSunLight } from "@/world/factories/sunLight";
import { createSunSphere } from "@/world/factories/sunSphere";
import { createTerrain } from "@/world/factories/terrain";
import { createWireframe } from "@/world/factories/wireframe";
import { logger } from "@/utils/logger";

export const worldInitSystem: WorldInitSystem = (world) => {
  logger.info("[world:init]");

  createTerrain(world);
  createCamera(world);
  createSunLight(world);
  createSunSphere(world);
  createWireframe(world);
  createDownslopeArrows(world);
};
