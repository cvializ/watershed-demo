import type { RendererInitSystem } from "@/renderer/types";

import { type CloudSphereSystem } from "@/gpu/createCloudSphereSystem";
import {
  type WaterFlowVisualization,
} from "@/gpu/createGpuWaterFlowSimulation";
import { createSimulationResource } from "@/renderer/resources/simulation";

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;

export const simulationInitSystem: RendererInitSystem = (_world, _scene, renderer) => {
  const simulationResource = createSimulationResource(renderer);

  waterSimulation = simulationResource.waterSimulation;
  cloudSphereSystem = simulationResource.cloudSphereSystem;
};
