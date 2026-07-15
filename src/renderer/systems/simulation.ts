import type { RendererSystem } from "@/renderer/types";

import { waterSimulation } from "@/renderer/systems/renderInitSystem";

export const simulationSystem: RendererSystem = (_world, _scene, _renderer, dt) => {
  if (!waterSimulation) {
    return;
  }

  waterSimulation.compute(dt);
};
