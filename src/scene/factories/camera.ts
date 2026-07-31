import { addComponent, addEntity, type World } from "bitecs";

import { Camera, Name, ObjectRef, Renderable } from "@/components/components";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { logger } from "@/utils/logger";

export const createCamera = (world: World): number => {
  logger.info("[camera:create]");

  const cameraEid = addEntity(world);
  addComponent(world, cameraEid, Camera);

  // Add ObjectRef and Renderable to leverage existing scene machinery
  addComponent(world, cameraEid, ObjectRef);
  ObjectRef.ref[cameraEid] = GeneralObjectEnum.Camera;

  addComponent(world, cameraEid, Renderable);

  addComponent(world, cameraEid, Name);
  Name.value[cameraEid] = "Camera";

  return cameraEid;
};
