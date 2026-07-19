import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { MaterialRef, Terrain } from "@/components/components";
import { MaterialEnum } from "@/scene/resources/material";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";

export const visualizationSystem: SceneSystem = (world, scene, _dt) => {
  const vizMode = world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

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
    const wireframes = scene.children.filter((obj: any) => obj.name === "terrain-wireframe");
    if (wireframes.length > 0) {
      // Wireframe is visible in Water Flow mode (4) or when explicitly enabled
      const showWireframe = vizMode === 4;
      wireframes.forEach((wireframe: any) => {
        (wireframe as any).visible = showWireframe;
      });
    }
  }

  // Only update materials when visualization mode changes
  if ((world as any).lastVizMode !== vizMode) {
    (world as any).lastVizMode = vizMode;

    const [terrain$] = query(world, [Terrain]);
    if (terrain$ !== undefined) {
      // Get current visualization mode
      const vizMode = world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

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
        default:
          // Water flow visualization
          MaterialRef.ref[terrain$] = MaterialEnum.WaterFlow;
          break;
      }
    }
  }
};
