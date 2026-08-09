import type { SceneSystem } from "@/scene/types";

import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { visualizationSystem } from "@/scene/systems/visualization";
import { getTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  visualizationSystem(world, scene, dt);

  // Update terrain painting system with React UI state
  const terrainPaintingManager = getTerrainPaintingManager();
  if (terrainPaintingManager) {
    terrainPaintingManager.updateFromUI({
      enabled: world.terrainPaintingEnabled,
      brushMaterial: world.terrainBrushMaterial,
      brushRadius: world.terrainBrushRadius,
      brushStrength: world.terrainBrushStrength,
    });
  }
};
