import { addComponent, addEntity, type World } from "bitecs";

import { Default, HeightMap, TextureRef } from "@/components/components";

export const createDefaultHeightmapTexture = (world: World) => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Default);
  addComponent(world, entity$, HeightMap);
  addComponent(world, entity$, TextureRef); // set by scene init system

  return entity$;
};

export const createTexture = (world: World, textureId: number, relation: unknown) => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, HeightMap);
  addComponent(world, entity$, TextureRef);

  if (relation) {
    addComponent(world, entity$, relation);
  }

  TextureRef.ref[entity$] = textureId; // pre-registered with registerTexture

  return entity$;
};
