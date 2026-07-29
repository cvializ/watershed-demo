import { addComponent, addEntity, type World } from "bitecs";

import { MeshRef, Name, Renderable, SunSphere } from "@/components/components";
import { MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export function createSunSphere(world: World): number {
  logger.info("[sunSphere:create]");

  const entity$ = addEntity(world);

  logger.info(`Adding SunSphere entity: ${entity$}`);

  addComponent(world, entity$, SunSphere);
  addComponent(world, entity$, MeshRef);
  addComponent(world, entity$, Renderable);
  addComponent(world, entity$, Name);

  MeshRef.ref[entity$] = MeshEnum.SunSphere;
  Name.value[entity$] = "SunSphere";

  return entity$;
}
