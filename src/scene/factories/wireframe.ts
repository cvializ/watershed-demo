import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Renderable, Wireframe } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";

export const createWireframe = (world: World): number => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Wireframe);
  addComponent(world, entity$, MeshRef);

  MeshRef.ref[entity$] = MeshEnum.Wireframe;

  addComponent(world, entity$, Renderable);

  return entity$;
};
