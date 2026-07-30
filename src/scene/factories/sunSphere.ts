import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export function createSunSphere(world: World): number {
  logger.info("[sunSphere:create]");

  const entity$ = addEntity(world);

  logger.info(`Adding SunSphere entity: ${entity$}`);

  addComponent(world, entity$, MeshRef);
  MeshRef.ref[entity$] = MeshEnum.SunSphere;

  addComponent(world, entity$, Renderable);
  addComponent(world, entity$, Name);

  Name.value[entity$] = "SunSphere";

  return entity$;
}
