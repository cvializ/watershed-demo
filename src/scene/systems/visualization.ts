import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, Name, Terrain } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

export const visualizationSystem: SceneSystem = (world, _scene, _dt) => {
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

  // Check for wireframe objects in scene
  const wireframe = getMesh(MeshEnum.Wireframe);
  // Wireframe is visible in Water Flow mode (4) or when explicitly enabled
  const showWireframe = vizMode === 4;
  wireframe.visible = showWireframe;

  // Query for terrain mesh
  const entities$ = query(world, []);
  logger.info(`ENTITIES: ${entities$}`);
  const [terrain$] = query(world, [Terrain]);
  if (!terrain$) {
    throw new Error("OH NO");
  }

  // Log terrain entity name for debugging - fixed by creating fresh deserializer in storage.ts
  logger.info(`Viz mode Name ${Name.value[terrain$]}`);

  // Check if material needs to be updated by comparing current material with expected
  const currentMaterialId = getCurrentMaterial(vizMode);
  const nextMaterialId = MaterialRef.ref[terrain$] as MaterialEnum;

  // Update if mode changed OR material doesn't match expected
  const shouldUpdate =
    world.lastVizMode !== vizMode || nextMaterialId !== currentMaterialId;

  if (shouldUpdate) {
    world.lastVizMode = vizMode;
    logger.info(
      `[visualization:switch] lastVizMode ${world.lastVizMode}, currentMaterialId ${nextMaterialId} expected ${currentMaterialId}`,
    );

    logger.info("terrain set to viz mode");
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
        // Testing simulation
        MaterialRef.ref[terrain$] = MaterialEnum.TestingSimulation;
        break;
    }
  }
};

/**
 * Get the expected material ID for a given visualization mode
 */
function getCurrentMaterial(mode: number): MaterialEnum {
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
      return MaterialEnum.TestingSimulation;
    default:
      // Default to WaterFlow for unknown modes
      return MaterialEnum.WaterFlow;
  }
}
