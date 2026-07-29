import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/scene/factories/camera";
import { createSunLight } from "@/scene/factories/sunLight";
import { createSunSphere } from "@/scene/factories/sunSphere";
import { createWaterSimulation } from "@/scene/factories/simulation";
import { createTerrain } from "@/scene/factories/terrain";
import { createWireframe } from "@/scene/factories/wireframe";
import { createDownslopeArrows } from "@/scene/factories/downslopeArrows";
import { logger } from "@/utils/logger";

export const worldInitSystem: WorldInitSystem = (world) => {
  logger.info("[world:init]");

  createTerrain(world);
  createCamera(world);
  createSunLight(world);
  createSunSphere(world);
  createWaterSimulation(world);
  createWireframe(world);
  createDownslopeArrows(world);
};
