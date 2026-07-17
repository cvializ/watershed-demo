import { addComponent, addEntity, type World } from "bitecs";

import { Default, MaterialRef } from "@/components/components";

export const createDefaultMaterial = (world: World) => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, MaterialRef); // set by scene init system

  return entity$;
};
