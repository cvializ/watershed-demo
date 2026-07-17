import type { RendererSystem } from "@/renderer/types";

import { simulationSystem } from "@/renderer/systems/simulation";

export const rendererSyncSystem: RendererSystem = (world, scene, renderer, dt) => {
  simulationSystem(world, scene, renderer, dt);
};
