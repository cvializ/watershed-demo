import { query } from "bitecs";

import type { WorldInitSystem } from "@/world/types";

import { MaterialRef, MeshRef, Terrain, WaterSimulation } from "@/components/components";
import { createCamera } from "@/world/factories/camera";
import { createDefaultMaterial } from "@/world/factories/material";
import { createWaterSimulation } from "@/world/factories/simulation";
import { createTerrain } from "@/world/factories/terrain";
import { createDefaultHeightmapTexture } from "@/world/factories/texture";
import { createWireframe } from "@/world/factories/wireframe";

const mutateTerrain: WorldInitSystem = (world) => {
  const [terrain$] = query(world, [MeshRef, Terrain]);
  const [simulation$] = query(world, [WaterSimulation]);

  if (!terrain$ || !simulation$) {
    return;
  }

  MaterialRef.ref[terrain$] = MaterialRef.ref[simulation$];
};

export const worldInitSystem: WorldInitSystem = (world) => {
  createDefaultMaterial(world);
  createDefaultHeightmapTexture(world);

  createTerrain(world);
  createCamera(world);

  createWaterSimulation(world);

  mutateTerrain(world);

  createWireframe(world);
};
