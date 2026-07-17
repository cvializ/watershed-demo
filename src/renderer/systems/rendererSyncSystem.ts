import type { RendererSystem } from "@/renderer/types";

import { simulationSystem } from "@/renderer/systems/simulation";
import { syncVisualizations } from "@/renderer/systems/syncVisualizations";

export const rendererSyncSystem: RendererSystem = (world, scene, renderer, dt) => {
  simulationSystem(world, scene, renderer, dt);
  syncVisualizations(world, scene, renderer, dt);
};
