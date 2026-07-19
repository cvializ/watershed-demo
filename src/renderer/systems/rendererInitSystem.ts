import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { addWaterInitSystem } from "@/renderer/systems/init/addWater";
import { cameraInitSystem } from "@/renderer/systems/init/camera";
import { resizeInitSystem } from "@/renderer/systems/init/resize";
import { simulationInitSystem } from "@/renderer/systems/init/simulation";

export const rendererInitSystem: RendererInitSystem = (world, scene, renderer) => {
  // Enable shadow mapping
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  cameraInitSystem(world, scene, renderer);
  simulationInitSystem(world, scene, renderer);
  addWaterInitSystem(world, scene, renderer);
  resizeInitSystem(world, scene, renderer);
};
