import { addEntity, addComponent, type World, query } from "bitecs";

import { Default, MaterialRef, MeshRef, Terrain } from "@/components/components";

export function createTerrain(world: World): number {
  const entity$ = addEntity(world);

  addComponent(world, entity$, Terrain);

  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, MeshRef); // configured in sceneInitSystem

  const [defaultMaterial] = query(world, [Default, MaterialRef]);
  MaterialRef.ref[entity$] = MaterialRef.ref[defaultMaterial];

  return entity$;
}
