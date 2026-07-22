import { addEntity, addComponent, type World } from "bitecs";

import { Camera } from "@/components/components";
import { logger } from "@/utils/logger";

export const createCamera = (world: World): number => {
  logger.info("[camera:create]");

  const cameraEid = addEntity(world);
  addComponent(world, cameraEid, Camera);

  return cameraEid;
};
