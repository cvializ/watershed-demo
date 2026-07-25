import { addComponent, addEntity, type World } from "bitecs";

import { Default, HeightMap, Name } from "@/components/components";
import { logger } from "@/utils/logger";

export const createDefaultHeightmapTexture = (world: World): number => {
  logger.info("[texture:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, HeightMap);
  addComponent(world, entity$, Name);

  Name.value[entity$] = "DefaultHeightmap";

  return entity$;
};
