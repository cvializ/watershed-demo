import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";
import type { TerrainPainter } from "@/terrain/paintTerrain";

import { type CloudSphereSystem } from "@/gpu/waterFlowSimulation/createCloudSphereSystem";
import { type WaterFlowVisualization } from "@/gpu/waterFlowSimulation/createGpuWaterFlowSimulation";
import { createSimulationResource } from "@/renderer/resources/simulation";
import { MeshEnum, getMesh } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getSurfaceMaterialTexture } from "@/scene/resources/surfaceMaterialTexture";
import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";
import { createTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";
import {
  createTerrainStateManager,
  type TerrainStateManager,
} from "@/terrain/TerrainStateManager";
import { logger } from "@/utils/logger";

export let waterSimulation: WaterFlowVisualization | null = null;
export let cloudSphereSystem: CloudSphereSystem | null = null;
let terrainStateManager: TerrainStateManager | null = null;

// Type declarations for window globals used in debugging/testing
declare global {
  interface Window {
    terrainStateManager?: TerrainStateManager;
    getTerrainMesh?: () => THREE.Mesh | null;
  }
}

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
  }

  // Recreate simulation with saved textures (surface material is handled in createSimulationResource)
  const simulationResource = createSimulationResource(renderer, savedTextures);

  waterSimulation = simulationResource.waterSimulation;
  cloudSphereSystem = simulationResource.cloudSphereSystem;

  // Re-initialize terrain painting with new simulation
  const tm = createTerrainPaintingManager();
  terrainStateManager = createTerrainStateManager();

  // createSimulationResource published the rebuilt manager on the scene holder
  const surfaceMaterialTexture = getSurfaceMaterialTexture();
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

  // createSimulationResource publishes the surface material manager on the scene
  // holder, so painting affects the SAME texture used by the water simulation
  // and the water-flow visualization material.

  // Initialize terrain painting manager and state manager
  const tm = createTerrainPaintingManager();
  terrainStateManager = createTerrainStateManager();

  // Expose for debugging and testing (development only)
  if (typeof window !== "undefined") {
    const win = window as unknown as Record<string, unknown>;
    win.terrainStateManager = terrainStateManager;
    win.getTerrainMesh = () => getMesh(MeshEnum.Terrain);
  }

  // Get required dependencies
  const surfaceMaterialTexture = getSurfaceMaterialTexture();
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
