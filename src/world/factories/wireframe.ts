import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const createWireframe = (world: World): number => {
  logger.info("[wireframe:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.Wireframe;

  addComponent(world, entity$, Renderable);
  addComponent(world, entity$, Name);

  Name.value[entity$] = "Wireframe";

  return entity$;
};
