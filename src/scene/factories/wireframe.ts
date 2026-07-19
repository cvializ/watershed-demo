import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Wireframe } from "@/components/components";

export const createWireframe = (world: World): number => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Wireframe);
  addComponent(world, entity$, MeshRef);

  return entity$;
};
