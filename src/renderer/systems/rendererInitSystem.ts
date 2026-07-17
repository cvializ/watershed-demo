import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { initAddWater } from "@/renderer/systems/init/addWater";
import { initResize } from "@/renderer/systems/init/resize";
import { initSimulation } from "@/renderer/systems/init/simulation";

export const rendererInitSystem: RendererInitSystem = (world, scene, renderer) => {
  // Enable shadow mapping
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  initSimulation(world, scene, renderer);
  initAddWater(world, scene, renderer);
  initResize(world, scene, renderer);
};
