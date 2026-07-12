import { addEntity, addComponent, type World } from "bitecs";

import { Camera } from "@/components/components";

export const createCamera = (world: World) => {
  const cameraEid = addEntity(world);
  addComponent(world, cameraEid, Camera);

  return cameraEid;
};
