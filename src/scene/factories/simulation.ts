import { addComponent, addEntity, type World } from "bitecs";

import { WaterSimulation, MaterialRef } from "@/components/components";
import { logger } from "@/utils/logger";

export const createWaterSimulation = (world: World): number => {
  logger.info("[simulation:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, WaterSimulation);
  addComponent(world, entity$, MaterialRef);

  return entity$;
};
