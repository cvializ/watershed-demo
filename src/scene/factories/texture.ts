import { addComponent, addEntity, type World } from "bitecs";

import { Default, HeightMap, TextureRef } from "@/components/components";
import { TextureEnum } from "@/scene/resources/texture";

export const createDefaultHeightmapTexture = (world: World) => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, HeightMap);
  addComponent(world, entity$, TextureRef);

  TextureRef.ref[entity$] = TextureEnum.DefaultHeightMap;

  return entity$;
};
