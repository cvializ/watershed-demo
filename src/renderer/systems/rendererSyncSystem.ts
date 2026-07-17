import type { RendererSystem } from "@/renderer/types";

import { simulationSystem } from "@/renderer/systems/simulation";
import { syncVisualizationSystem } from "@/scene/systems/visualization";

export const rendererSyncSystem: RendererSystem = (world, scene, renderer, dt) => {
  simulationSystem(world, scene, renderer, dt);
  syncVisualizationSystem(world, scene, renderer, dt);
};
