import { addComponent, addEntity, type World } from "bitecs";

import {
  MaterialRef,
  MeshRef,
  Name,
  Renderable,
  Terrain,
} from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export function createTerrain(world: World): number {
  logger.info("[terrain:create]");

  const entity$ = addEntity(world);

  logger.info(`Adding Terrain entity: ${entity$}`);

  addComponent(world, entity$, Terrain);
  addComponent(world, entity$, MaterialRef);
  MaterialRef.ref[entity$] = MaterialEnum.Default;

  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.Terrain;

  addComponent(world, entity$, Name);
  Name.value[entity$] = "Terrain";

  logger.debug("RENDERABLE");
  addComponent(world, entity$, Renderable);

  return entity$;
}
