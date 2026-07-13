import { addComponent, addEntity, type World } from "bitecs";

import { WaterSimulation, MaterialRef, TextureRef } from "@/components/components";

export const createWaterSimulation = (world: World): number => {
  const eid = addEntity(world);

  addComponent(world, eid, TextureRef);
  addComponent(world, eid, WaterSimulation);
  addComponent(world, eid, MaterialRef);

  return eid;
};
