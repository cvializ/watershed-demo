import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, Terrain } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const visualizationSystem: SceneSystem = (world, scene, _dt) => {
  // Get current visualization mode
  const vizMode =
    world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

  // Handle downslope arrows visibility
  if (vizMode === 3) {
    // Show downslope arrows when in Downslope mode
    const arrows = getMesh(MeshEnum.DownslopeArrows);
    if (arrows && arrows.visible !== undefined) {
      arrows.visible = true;
    }
  } else {
    // Hide downslope arrows in other modes
    const arrows = getMesh(MeshEnum.DownslopeArrows);
    if (arrows && arrows.visible !== undefined) {
      arrows.visible = false;
    }
  }

  // Handle wireframe visibility based on visualization mode
  if (scene) {
    // Check for wireframe objects in scene
    const wireframes = scene.children.filter(
      (obj: any) => obj.name === "terrain-wireframe",
    );
    if (wireframes.length > 0) {
      // Wireframe is visible in Water Flow mode (4) or when explicitly enabled
      const showWireframe = vizMode === 4;
      wireframes.forEach((wireframe: any) => {
        (wireframe as any).visible = showWireframe;
      });
    }
  }

  logger.info(`[visualization:switch] vizMode ${vizMode}`);
  
  // Query for terrain mesh
  const [terrain$] = query(world, [Terrain]);
  if (!terrain$) {
    throw new Error("OH NO");
  }
  
  // Check if material needs to be updated by comparing current material with expected
  const expectedMaterial = getExpectedMaterial(vizMode);
  const currentMaterialId = MaterialRef.ref[terrain$] as MaterialEnum;
  
  // Update if mode changed OR material doesn't match expected
  const shouldUpdate = world.lastVizMode !== vizMode || currentMaterialId !== expectedMaterial;
  
  if (shouldUpdate) {
    world.lastVizMode = vizMode;
    logger.info(
      `[visualization:switch] lastVizMode ${world.lastVizMode}, currentMaterialId ${currentMaterialId} expected ${expectedMaterial}`,
    );
    
    switch (vizMode) {
      case 0:
        // Height-based visualization
        MaterialRef.ref[terrain$] = MaterialEnum.HeightVisualization;
        break;
      case 1:
        // Slope-based visualization
        MaterialRef.ref[terrain$] = MaterialEnum.Slope;
        break;
      case 2:
        // Normal material for verification
        MaterialRef.ref[terrain$] = MaterialEnum.Normal;
        break;
      case 3:
        // Downslope arrows - use default material but show arrows
        MaterialRef.ref[terrain$] = MaterialEnum.Default;
        break;
      case 4:
      case 5:
        // Water flow visualization (both modes use same material)
        MaterialRef.ref[terrain$] = MaterialEnum.WaterFlow;
        break;
      case 6:
        // Pulsing simulation
        MaterialRef.ref[terrain$] = MaterialEnum.PulsingSimulation;
        break;
    }
  }
};

/**
 * Get the expected material ID for a given visualization mode
 */
function getExpectedMaterial(mode: number): MaterialEnum {
  switch (mode) {
    case 0:
      return MaterialEnum.HeightVisualization;
    case 1:
      return MaterialEnum.Slope;
    case 2:
      return MaterialEnum.Normal;
    case 3:
      return MaterialEnum.Default;
    case 4:
    case 5:
      return MaterialEnum.WaterFlow;
    case 6:
      return MaterialEnum.PulsingSimulation;
    default:
      // Default to WaterFlow for unknown modes
      return MaterialEnum.WaterFlow;
  }
}
