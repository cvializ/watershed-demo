import { query } from "bitecs";

import type { WorldInitSystem } from "@/world/types";

import { MaterialRef, MeshRef, Terrain, WaterSimulation } from "@/components/components";
import { createCamera } from "@/scene/factories/camera";
import { createDefaultMaterial } from "@/scene/factories/material";
import { createWaterSimulation } from "@/scene/factories/simulation";
import { createTerrain } from "@/scene/factories/terrain";
import { createDefaultHeightmapTexture } from "@/scene/factories/texture";
import { createWireframe } from "@/scene/factories/wireframe";

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
