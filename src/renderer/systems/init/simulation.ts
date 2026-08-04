import type { RendererInitSystem } from "@/renderer/types";

import * as THREE from "three";

import { type CloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { type WaterFlowVisualization } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import { createTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";
import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";
import type { TerrainPainter } from "@/terrain/paintTerrain";
import { MeshEnum, getMesh } from "@/scene/resources/mesh";
import type { SurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";
import { createSurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";
import { createSimulationResource } from "@/renderer/resources/simulation";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;
let surfaceMaterialTexture: SurfaceMaterialTexture | null = null;

const SIM_SIZE = 512;
const terrainSize = 12;

export const simulationInitSystem: RendererInitSystem = (
  _world,
  _scene,
  renderer,
) => {
  const simulationResource = createSimulationResource(renderer);

  waterSimulation = simulationResource.waterSimulation;
  cloudSphereSystem = simulationResource.cloudSphereSystem;

  // Create surface material texture for terrain painting
  surfaceMaterialTexture = createSurfaceMaterialTexture(SIM_SIZE, terrainSize);

  // Initialize terrain painting manager
  const terrainPaintingManager = createTerrainPaintingManager();

  // Get required dependencies
  if (waterSimulation && surfaceMaterialTexture) {
    // Create terrain painter that actually paints on the surface material texture
    const terrainPainter: TerrainPainter = createTerrainPainterFromSurfaceMaterial(
      surfaceMaterialTexture,
    );

    // Use the actual camera from the scene, not a new instance
    const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    const terrainMesh = getMesh(MeshEnum.Terrain);

    if (terrainPaintingManager && camera && terrainMesh) {
      terrainPaintingManager.initialize({
        terrainPainter,
        camera,
        terrainMesh,
      });
    }
  }
};