import { observe, onAdd } from "bitecs";
import { query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { MaterialRef, MeshRef, Terrain, TextureRef } from "@/components/components";
import { createDownslopeArrowGeometry } from "@/nodes/geometry/createDownslopeArrowGeometry";
import {
  createDownslopeArrowMaterialResource,
  createDefaultMaterialResource,
  createHeightVisualizationMaterialResource,
  createNormalMaterialResource,
  createSlopeVisualizationMaterialResource,
} from "@/scene/resources/material";
import { getMaterial } from "@/scene/resources/material";
import { getTexture } from "@/scene/resources/texture";

/**
 * Create downslope arrow geometry for terrain.
 * These are rendered as LineSegments on top of the terrain mesh.
 */
const createDownslopeArrows: RendererInitSystem = (world, scene) => {
  // Check if arrows already exist
  const existingArrows = scene.objects.find((obj: any) => obj.name === "downslope-arrows") as any;
  if (existingArrows) {
    return; // Already created
  }

  const [terrainEntity$] = query(world, [Terrain, MeshRef]);
  if (!terrainEntity$) {
    console.error("Cannot create downslope arrows: terrain entity not found");
    return;
  }

  const meshId = MeshRef.ref[terrainEntity$];
  if (!meshId) {
    console.error("Cannot create downslope arrows: terrain mesh reference not found");
    return;
  }

  const terrain = scene.getObjectById(meshId);
  if (!terrain || !(terrain instanceof THREE.Mesh)) {
    console.error("Cannot create downslope arrows: terrain mesh not found in scene");
    return;
  }

  // Create downslope arrow geometry
  const arrowGeometry = createDownslopeArrowGeometry(terrain.geometry, 0.3);

  // Create material for arrows
  const { materialId: arrowMaterialId } = createDownslopeArrowMaterialResource();
  const arrowMaterial = getMaterial(arrowMaterialId);

  // Create LineSegments
  const arrows = new THREE.LineSegments(arrowGeometry, arrowMaterial);
  arrows.name = "downslope-arrows";
  arrows.rotation.x = -Math.PI / 2;
  scene.add(arrows);

  // Store reference on world for visibility toggling
  (world as any).downslopeArrowEntity = arrows;
};

export const initVisualizations: RendererInitSystem = (world, scene, _renderer) => {
  // Initialize default visualization mode
  if (!world.visualizationMode) {
    world.visualizationMode = 1; // Start with Water Flow mode
  }

  /**
   * Create materials for terrain entities based on visualization mode.
   * This is called when a Terrain entity with MaterialRef is added,
   * or when the visualization mode changes.
   */
  const updateMaterialForVisualizationMode = (entity$: number) => {
    // Get the terrain mesh and heightmap
    const [terrainEntity$] = query(world, [Terrain, MeshRef]);

    if (!terrainEntity$) {
      console.error("Cannot update material: terrain entity not found");
      return;
    }

    const meshId = MeshRef.ref[terrainEntity$];
    if (!meshId) {
      console.error("Cannot update material: terrain mesh reference not found");
      return;
    }

    const heightmapEntity$ = TextureRef.ref[terrainEntity$];
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
        MaterialRef.ref[entity$] = createHeightVisualizationMaterialResource({
          heightmap: heightMap,
        }).materialId;
        break;
      case 1:
        // Slope-based visualization
        MaterialRef.ref[entity$] = createSlopeVisualizationMaterialResource().materialId;
        break;
      case 2:
        // Normal material for verification
        MaterialRef.ref[entity$] = createNormalMaterialResource().materialId;
        break;
      case 3:
        // Downslope arrows - use default material but show arrows
        MaterialRef.ref[entity$] = createDefaultMaterialResource().materialId;

        // Create downslope arrows if they don't exist
        createDownslopeArrows(world, scene);
        break;
      case 4:
      default:
        // Water flow visualization - need to use the water material
        // For now, fall back to default or height visualization
        MaterialRef.ref[entity$] = createHeightVisualizationMaterialResource({
          heightmap: heightMap,
        }).materialId;
        break;
    }
  };

  // Update materials when terrain entities with MaterialRef are added
  observe(world, onAdd(Terrain, MaterialRef), (entity$) => {
    updateMaterialForVisualizationMode(entity$);
  });

  // Store a function to update visualization on mode change
  (world as any).updateVisualizationMaterial = updateMaterialForVisualizationMode;
};
