import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";
import type { SurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";
import type { TerrainPainter } from "@/terrain/paintTerrain";

import { type CloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { type WaterFlowVisualization } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import { createSimulationResource } from "@/renderer/resources/simulation";
import { MeshEnum, getMesh } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";
import { createTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;
let surfaceMaterialTexture: SurfaceMaterialTexture | null = null;

export const simulationInitSystem: RendererInitSystem = (
  _world,
  _scene,
  renderer,
) => {
  const simulationResource = createSimulationResource(renderer);

  waterSimulation = simulationResource.waterSimulation;
  cloudSphereSystem = simulationResource.cloudSphereSystem;

  // Reuse the surface material texture created in createSimulationResource
  // so painting affects the SAME texture used by the water simulation and
  // the water-flow visualization material.
  surfaceMaterialTexture = simulationResource.surfaceMaterialTexture;

  // Initialize terrain painting manager
  const terrainPaintingManager = createTerrainPaintingManager();

  // Get required dependencies
  if (waterSimulation && surfaceMaterialTexture) {
    // Create terrain painter that paints on the shared surface material texture
    const terrainPainter: TerrainPainter =
      createTerrainPainterFromSurfaceMaterial(surfaceMaterialTexture);

    // Use the actual camera from the scene, not a new instance
    const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    const terrainMesh = getMesh(MeshEnum.Terrain);

    if (terrainPaintingManager && camera && terrainMesh) {
      terrainPaintingManager.initialize({
        terrainPainter,
        camera,
        terrainMesh,
      });

      // Pass surface material texture to painting system for cursor sampling
      const paintingSystem = terrainPaintingManager.getPaintingSystem();
      if (paintingSystem) {
        paintingSystem.setSurfaceMaterialTexture(surfaceMaterialTexture);
      }
    }
  }
};
