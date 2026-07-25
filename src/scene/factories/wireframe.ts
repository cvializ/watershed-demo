import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable, Wireframe } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const createWireframe = (world: World): number => {
  logger.info("[wireframe:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, Wireframe);
  addComponent(world, entity$, MeshRef);
  addComponent(world, entity$, Name);

  MeshRef.ref[entity$] = MeshEnum.Wireframe;
  Name.value[entity$] = "Wireframe";

  addComponent(world, entity$, Renderable);

  return entity$;
};
