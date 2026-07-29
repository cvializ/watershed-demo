import { addComponent, addEntity, type World } from "bitecs";

import { CloudSimulation, Name, MaterialRef } from "@/components/components";
import { logger } from "@/utils/logger";

/**
 * Creates a cloud simulation entity in the ECS world.
 *
 * @param world - The ECS World instance
 * @returns The entity ID of the created cloud simulation
 */
export const createCloudSimulation = (world: World): number => {
  logger.info("[cloud:simulation:create]");

  const entity$ = addEntity(world);

  addComponent(world, entity$, CloudSimulation);
  addComponent(world, entity$, MaterialRef);
  addComponent(world, entity$, Name);

  Name.value[entity$] = "CloudSimulation";

  return entity$;
};