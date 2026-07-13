import { addComponent, addEntity, type Relation, type World } from "bitecs";

import { Default, HeightMap, TextureRef } from "@/components/components";

export const createDefaultHeightmapTexture = (world: World) => {
  const eid = addEntity(world);

  addComponent(world, eid, Default);
  addComponent(world, eid, HeightMap);
  addComponent(world, eid, TextureRef); // set by scene init system

  return eid;
};

export const createTexture = (world: World, textureId: number, relation: unknown) => {
  const eid = addEntity(world);

  addComponent(world, eid, HeightMap);
  addComponent(world, eid, TextureRef);

  if (relation) {
    addComponent(world, eid, relation);
  }

  TextureRef.ref[eid] = textureId; // pre-registered with registerTexture

  return eid;
};
