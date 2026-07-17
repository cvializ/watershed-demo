import { query } from "bitecs";

import type { RendererSystem } from "@/renderer/types";
import type { SceneSystem } from "@/scene/types";

import { MaterialRef, MeshRef, Terrain, TextureRef } from "@/components/components";
import {
  createDefaultMaterialResource,
  createHeightVisualizationMaterialResource,
  createNormalMaterialResource,
  createSlopeVisualizationMaterialResource,
} from "@/scene/resources/material";
import { getTexture } from "@/scene/resources/texture";

export const syncVisualizationsSystem: RendererSystem = (world, scene, _renderer, _dt) => {
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

  // If visualization mode changed, trigger material update
  if ((world as any).lastVizMode !== vizMode) {
    (world as any).lastVizMode = vizMode;

    // Update materials for all terrain entities with MaterialRef
    // const materialMeshes$ = query(world, [Terrain, MeshRef]);
    // for (const mesh$ of materialMeshes$) {
    //   if ((world as any).updateVisualizationMaterial) {
    //     (world as any).updateVisualizationMaterial(mesh$);
    //   }
    // }
  }
};

/**
 * Create materials for terrain entities based on visualization mode.
 * This is called when a Terrain entity with MaterialRef is added,
 * or when the visualization mode changes.
 */
const updateMaterialForVisualizationMode: SceneSystem = (world, scene) => {
  const [terrain$] = query(world, [Terrain, MeshRef]);
  // for (const mesh$ of materialMeshes$) {
  //   if ((world as any).updateVisualizationMaterial) {
  //     (world as any).updateVisualizationMaterial(mesh$);
  //   }
  // }

  // Check if this entity has the required components
  if (!MeshRef.ref[terrain$]) {
    console.error("Cannot update material: terrain mesh reference not found");
    return;
  }

  const heightmapEntity$ = TextureRef.ref[terrain$];
  if (!heightmapEntity$) {
    console.error("Cannot update material: heightmap texture reference not found");
    return;
  }

  const heightMap = getTexture(heightmapEntity$);
  if (!heightMap) {
    console.error("Cannot update material: heightmap texture not found in cache");
    return;
  }

  // Get current visualization mode
  const vizMode = world.visualizationMode !== undefined ? world.visualizationMode : 4; // Default to Water Flow

  switch (vizMode) {
    case 0:
      // Height-based visualization
      MaterialRef.ref[terrain$] = createHeightVisualizationMaterialResource({
        heightmap: heightMap,
      }).materialId;
      break;
    case 1:
      // Slope-based visualization
      MaterialRef.ref[terrain$] = createSlopeVisualizationMaterialResource().materialId;
      break;
    case 2:
      // Normal material for verification
      MaterialRef.ref[terrain$] = createNormalMaterialResource().materialId;
      break;
    case 3:
      // Downslope arrows - use default material but show arrows
      MaterialRef.ref[terrain$] = createDefaultMaterialResource().materialId;
      break;
    case 4:
    default:
      // Water flow visualization - need to use the water material
      // For now, fall back to default or height visualization
      MaterialRef.ref[terrain$] = createHeightVisualizationMaterialResource({
        heightmap: heightMap,
      }).materialId;
      break;
  }
};
