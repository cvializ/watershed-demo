import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const createDownslopeArrows = (world: World): number => {
  logger.info("[downslopeArrows:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.DownslopeArrows;

  addComponent(world, entity$, Renderable);
  addComponent(world, entity$, Name);

  Name.value[entity$] = "DownslopeArrows";

  return entity$;
};