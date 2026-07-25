import { addComponent, addEntity, type World } from "bitecs";

import { Default, MaterialRef, Name } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { logger } from "@/utils/logger";

export const createDefaultMaterial = (world: World): number => {
  logger.info("[material:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, Name);

  MaterialRef.ref[entity$] = MaterialEnum.Default;
  Name.value[entity$] = "DefaultMaterial";

  return entity$;
};
