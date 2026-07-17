import { observe, onAdd } from "bitecs";
import * as THREE from "three";

import type { SceneInitSystem } from "@/scene/types";

import { MeshRef, Terrain } from "@/components/components";
import { createDownslopeArrowGeometry } from "@/nodes/geometry/createDownslopeArrowGeometry";
import { createDownslopeArrowMaterialResource } from "@/scene/resources/material";
import { getMaterial } from "@/scene/resources/material";

/**
 * Create downslope arrow geometry for terrain.
 * These are rendered as LineSegments on top of the terrain mesh.
 */
export const visualizationInitSystem: SceneInitSystem = (world: any, scene: THREE.Scene) => {
  // Check if arrows already exist
  observe(world, onAdd(Terrain), (terrainEntity$) => {
    const existingArrows = scene.children.find(
      (obj: any) => obj.name === "downslope-arrows",
    ) as any;
    if (existingArrows) {
      return; // Already created
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
    (world as any).downslopeArrowId = arrows.id;
  });
};
