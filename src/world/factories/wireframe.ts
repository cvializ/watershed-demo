import { addComponent, addEntity, type World } from "bitecs";

import { MaterialRef, MeshRef, Wireframe } from "@/components/components";

export const createWireframe = (world: World): number => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Wireframe);
  addComponent(world, entity$, MeshRef); // set by scene init system
  addComponent(world, entity$, MaterialRef); // set by scene init system

  return entity$;
};