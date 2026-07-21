import { addComponent, addEntity, type World } from "bitecs";

import { Default, HeightMap } from "@/components/components";

export const createDefaultHeightmapTexture = (world: World) => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, HeightMap);

  return entity$;
};
