import { addComponent, addEntity, type World } from "bitecs";

import { Default, MaterialRef } from "@/components/components";

export const createDefaultMaterial = (world: World) => {
  const eid = addEntity(world);

  addComponent(world, eid, Default);
  addComponent(world, eid, MaterialRef); // set by scene init system

  return eid;
};
