import type { SceneSystem } from "@/scene/types";

export const syncVisualizationSystem: SceneSystem = (world, scene, _dt) => {
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
