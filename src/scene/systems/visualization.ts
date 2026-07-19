import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import {
  MaterialRef,
  MeshRef,
  Terrain,
  TextureRef,
  WaterSimulation,
} from "@/components/components";
import {
  createDefaultMaterialResource,
  createHeightVisualizationMaterialResource,
  createNormalMaterialResource,
  createSlopeVisualizationMaterialResource,
  MaterialEnum,
} from "@/scene/resources/material";
import { getTexture } from "@/scene/resources/texture";

/**
 * Create materials for terrain entities based on visualization mode.
 * This is called when a Terrain entity with MaterialRef is added,
 * or when the visualization mode changes.
 */
const updateMaterialForVisualizationMode = (world: any, entity$: number) => {
  // Check if this entity has the required components
  if (!MeshRef.ref[entity$]) {
    console.error("Cannot update material: terrain mesh reference not found");
    return;
  }

  const heightmapEntity$ = TextureRef.ref[entity$];
  if (!heightmapEntity$) {
    console.error("Cannot update material: heightmap texture reference not found");
    return;
  }

  const heightMap = getTexture(heightmapEntity$);
  if (!heightMap) {
    console.error("Cannot update material: heightmap texture not found in cache");
    return;
  }

  const [simulation$] = query(world, [WaterSimulation, MaterialRef]);
  if (!simulation$) {
    console.error("Cannot update material: simulation textureref not found in world");
    return;
  }

  // Get current visualization mode
  const vizMode = world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

  switch (vizMode) {
    case 0:
      // Height-based visualization
      MaterialRef.ref[entity$] = MaterialEnum.HeightVisualization;
      break;
    case 1:
      // Slope-based visualization
      MaterialRef.ref[entity$] = MaterialEnum.Slope;
      break;
    case 2:
      // Normal material for verification
      MaterialRef.ref[entity$] = MaterialEnum.Normal;
      break;
    case 3:
      // Downslope arrows - use default material but show arrows
      MaterialRef.ref[entity$] = MaterialEnum.Default;
      break;
    case 4:
    default:
      // Water flow visualization
      MaterialRef.ref[entity$] = MaterialRef.ref[simulation$];
      break;
  }
};

export const visualizationSystem: SceneSystem = (world, scene, _dt) => {
  const vizMode = world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

  // Handle downslope arrows visibility
  if (vizMode === 3) {
    // Show downslope arrows when in Downslope mode
    const arrows = scene.getObjectById(world.downslopeArrowId);
    if (arrows && arrows.visible !== undefined) {
      arrows.visible = true;
    }
  } else {
    // Hide downslope arrows in other modes
    const arrows = scene.getObjectById(world.downslopeArrowId);
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
      updateMaterialForVisualizationMode(world, terrain$);
    }
  }
};
