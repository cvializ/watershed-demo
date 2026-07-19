import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/scene/factories/camera";
import { createWaterSimulation } from "@/scene/factories/simulation";
import { createTerrain } from "@/scene/factories/terrain";
import { createWireframe } from "@/scene/factories/wireframe";

export const worldInitSystem: WorldInitSystem = (world) => {
  createTerrain(world);
  createCamera(world);
  createWaterSimulation(world);
  createWireframe(world);
};
