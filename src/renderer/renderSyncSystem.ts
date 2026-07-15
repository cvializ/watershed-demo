import type { RendererSystem } from "@/renderer/types";

import { waterSimulation } from "@/renderer/renderInitSystem";

export const rendererSyncSystem: RendererSystem = (_world, _scene, _renderer, dt) => {
  if (!waterSimulation) {
    return;
  }

  waterSimulation.compute(dt);
};
