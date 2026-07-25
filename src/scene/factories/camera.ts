import { addComponent, addEntity, type World } from "bitecs";

import { Camera, Name } from "@/components/components";
import { logger } from "@/utils/logger";

export const createCamera = (world: World): number => {
  logger.info("[camera:create]");

  const cameraEid = addEntity(world);
  addComponent(world, cameraEid, Camera);
  addComponent(world, cameraEid, Name);

  Name.value[cameraEid] = "Camera";

  return cameraEid;
};
