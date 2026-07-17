import type { RendererSystem } from "@/renderer/types";

import { simulationSystem } from "@/renderer/systems/simulation";
import { syncVisualizationsSystem } from "@/renderer/systems/syncVisualizations";

export const rendererSyncSystem: RendererSystem = (world, scene, renderer, dt) => {
  simulationSystem(world, scene, renderer, dt);
  syncVisualizationsSystem(world, scene, renderer, dt);
};
