import { addEntity, addComponent, type World, query } from "bitecs";

import { Default, MaterialRef, MeshRef, Terrain, TextureRef } from "@/components/components";
import { getMaterialEnum, MaterialEnum } from "@/scene/resources/material";

export function createTerrain(world: World): number {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Terrain);

  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, TextureRef); // configured in sceneInitSystem
  addComponent(world, entity$, MeshRef); // configured in sceneInitSystem

  MaterialRef.ref[entity$] = getMaterialEnum(MaterialEnum.Default);

  return entity$;
}
