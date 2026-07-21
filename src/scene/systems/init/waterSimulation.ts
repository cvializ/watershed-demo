import { observe, onAdd } from "bitecs";

import type { SceneInitSystem } from "@/scene/types";

import { MaterialRef, WaterSimulation } from "@/components/components";
import {
  MaterialEnum,
} from "@/scene/resources/material";

export const waterSimulationInitSystem: SceneInitSystem = (world) => {
  observe(world, onAdd(WaterSimulation), (entity$) => {
    console.log("ON ADD SIMULATION");
    MaterialRef.ref[entity$] = MaterialEnum.WaterFlow;
  });
};
