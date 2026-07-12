import { addEntity, addComponent, type World, query } from "bitecs";

import { Default, MaterialRef, MeshRef, Terrain } from "@/components/components";

export function createTerrain(world: World): number {
  const eid = addEntity(world);

  addComponent(world, eid, Terrain);

  addComponent(world, eid, MaterialRef);
  addComponent(world, eid, MeshRef); // configured in sceneInitSystem

  const [defaultMaterial] = query(world, [Default, MaterialRef]);
  MaterialRef.ref[eid] = MaterialRef.ref[defaultMaterial];

  return eid;
}
