import { addComponent, addEntity, type World } from "bitecs";

import { Default, MaterialRef } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { logger } from "@/utils/logger";

export const createDefaultMaterial = (world: World): number => {
  logger.info("[material:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, MaterialRef);

  MaterialRef.ref[entity$] = MaterialEnum.Default;

  return entity$;
};
