import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/scene/factories/camera";
import { createDownslopeArrows } from "@/scene/factories/downslopeArrows";
import { createSunLight } from "@/scene/factories/sunLight";
import { createSunSphere } from "@/scene/factories/sunSphere";
import { createTerrain } from "@/scene/factories/terrain";
import { createWireframe } from "@/scene/factories/wireframe";
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
