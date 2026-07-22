import { addEntity, addComponent, type World } from "bitecs";

import { MaterialRef, MeshRef, Renderable, Terrain } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export function createTerrain(world: World): number {
  logger.info("[terrain:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, Terrain);
  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, MeshRef);

  MaterialRef.ref[entity$] = MaterialEnum.Default;
  MeshRef.ref[entity$] = MeshEnum.Terrain;

  logger.debug("RENDERABLE");
  addComponent(world, entity$, Renderable);

  return entity$;
}
