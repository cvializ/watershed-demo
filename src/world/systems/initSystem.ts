import type { WorldInitSystem } from "@/world/types";

import { createCamera } from "@/world/factories/camera";
import { createDefaultMaterial } from "@/world/factories/material";
import { createTerrain } from "@/world/factories/terrain";

export const worldInitSystem: WorldInitSystem = (world) => {
  createDefaultMaterial(world);
  createTerrain(world);
  createCamera(world);
};
