import { addEntity, addComponent, type World } from "bitecs";

import { MaterialRef, MeshRef, Terrain } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";

export function createTerrain(world: World): number {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Terrain);
  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, MeshRef);

  MaterialRef.ref[entity$] = MaterialEnum.Default;

  return entity$;
}
