import { addComponent, addEntity, type World } from "bitecs";

import { Name, ObjectRef, Renderable } from "@/components/components";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { logger } from "@/utils/logger";

export function createSunLight(world: World): number {
  logger.info("[sunLight:create]");

  const entity$ = addEntity(world);

  logger.info(`Adding SunLight entity: ${entity$}`);

  addComponent(world, entity$, Name);
  addComponent(world, entity$, ObjectRef);
  ObjectRef.ref[entity$] = GeneralObjectEnum.SunLight;

  addComponent(world, entity$, Renderable);
  Name.value[entity$] = "SunLight";

  return entity$;
}
