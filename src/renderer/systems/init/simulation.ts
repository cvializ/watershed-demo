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
import { createTerrainStateManager, type TerrainStateManager } from "@/terrain/TerrainStateManager";
import { logger } from "@/utils/logger";

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;
let surfaceMaterialTexture: SurfaceMaterialTexture | null = null;
export let terrainStateManager: TerrainStateManager | null = null;

/**
 * Recreate the GPU simulation with saved state textures (for save/load)
 */
export const recreateSimulationWithSavedState = (
  _world: any,
  _scene: any,
  renderer: THREE.WebGLRenderer,
  savedTextures: import("@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation").SavedSimulationTextures,
): void => {
  logger.info("[simulation:recreate] Recreating simulation with saved state");

  // Destroy existing simulation if present
  if (waterSimulation) {
    logger.info("[simulation:recreate] Destroying existing simulation");
    // Note: GPU resources will be cleaned up by destroyGpuSimulation when needed
  }

  // Recreate simulation with saved textures
  const simulationResource = createSimulationResource(renderer, savedTextures);

  waterSimulation = simulationResource.waterSimulation;
  cloudSphereSystem = simulationResource.cloudSphereSystem;

  // Reuse the surface material texture created in createSimulationResource
  surfaceMaterialTexture = simulationResource.surfaceMaterialTexture;

  // Re-initialize terrain painting with new simulation
  const tm = createTerrainPaintingManager();
  terrainStateManager = createTerrainStateManager();

  if (waterSimulation && surfaceMaterialTexture) {
    const terrainPainter: TerrainPainter =
      createTerrainPainterFromSurfaceMaterial(surfaceMaterialTexture);

    const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    const terrainMesh = getMesh(MeshEnum.Terrain);

    if (tm && camera && terrainMesh) {
      tm.initialize({
        terrainPainter,
        camera,
        terrainMesh,
      });

      const paintingSystem = tm.getPaintingSystem();
      if (paintingSystem) {
        paintingSystem.setSurfaceMaterialTexture(surfaceMaterialTexture);
      }
    }
  }
};

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

  // Initialize terrain painting manager and state manager
  const tm = createTerrainPaintingManager();
  terrainStateManager = createTerrainStateManager();

  // Expose globally for debugging and testing
  if (typeof window !== "undefined") {
    (window as any).terrainStateManager = terrainStateManager;
    (window as any).getTerrainMesh = () => getMesh(MeshEnum.Terrain);
  }

  // Get required dependencies
  if (waterSimulation && surfaceMaterialTexture) {
    // Create terrain painter that paints on the shared surface material texture
    const terrainPainter: TerrainPainter =
      createTerrainPainterFromSurfaceMaterial(surfaceMaterialTexture);

    // Use the actual camera from the scene, not a new instance
    const camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    const terrainMesh = getMesh(MeshEnum.Terrain);

    if (tm && camera && terrainMesh) {
      tm.initialize({
        terrainPainter,
        camera,
        terrainMesh,
      });

      // Pass surface material texture to painting system for cursor sampling
      const paintingSystem = tm.getPaintingSystem();
      if (paintingSystem) {
        paintingSystem.setSurfaceMaterialTexture(surfaceMaterialTexture);
      }
    }
  }
};
