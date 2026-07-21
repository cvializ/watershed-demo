import { observe, onAdd } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { MaterialRef, WaterSimulation } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { logger } from "@/utils/logger";

export const waterSimulationInitSystem: SceneInitSystem = (world) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    logger.debug("ON ADD SIMULATION");
    MaterialRef.ref[entity$] = MaterialEnum.WaterFlow;
  });
};
