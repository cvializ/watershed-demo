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
  const [terrainEid] = query(world, [MeshRef, Terrain]);
  const [simulationEid] = query(world, [WaterSimulation]);

  if (!terrainEid || !simulationEid) {
    return;
  }

  MaterialRef.ref[terrainEid] = MaterialRef.ref[simulationEid];
};

export const worldInitSystem: WorldInitSystem = (world) => {
  createDefaultMaterial(world);
  createTerrain(world);
  createCamera(world);
  createDefaultHeightmapTexture(world);

  createWaterSimulation(world);

  mutateTerrain(world);

  createWireframe(world);
};
