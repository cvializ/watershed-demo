import type { RendererSystem } from "@/renderer/types";

import { waterSimulation } from "@/renderer/renderInitSystem";

export const rendererSyncSystem: RendererSystem = (_world, _scene, _renderer, _dt) => {
  if (!waterSimulation) {
    return;
  }

  waterSimulation.compute(1 / 60);
};
