import { addComponent, addEntity, type World } from "bitecs";

import { WaterSimulation, MaterialRef } from "@/components/components";

export const createWaterSimulation = (world: World): number => {
  const entity$ = addEntity(world);

  addComponent(world, entity$, WaterSimulation);
  addComponent(world, entity$, MaterialRef);

  return entity$;
};
