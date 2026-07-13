import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/world/factories/camera";
import { createDefaultMaterial } from "@/world/factories/material";
import { createWaterSimulation } from "@/world/factories/simulation";
import { createTerrain } from "@/world/factories/terrain";
import { createDefaultHeightmapTexture } from "@/world/factories/texture";

export const worldInitSystem: WorldInitSystem = (world) => {
  createDefaultMaterial(world);
  createTerrain(world);
  createCamera(world);
  createDefaultHeightmapTexture(world);
  createWaterSimulation(world);
};
