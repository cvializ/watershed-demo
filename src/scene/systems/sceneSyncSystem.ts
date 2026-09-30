import type { SceneSystem } from "@/scene/types";

import { animalSystem } from "@/scene/systems/animal";
import { materialSystem } from "@/scene/systems/material";
import { positionSystem } from "@/scene/systems/position";
import { shadowMapUpdateSystem } from "@/scene/systems/shadowMapUpdate";
import { starfieldSystem } from "@/scene/systems/starfield";
import { sunBackgroundSystem } from "@/scene/systems/sunBackground";
import { visualizationSystem } from "@/scene/systems/visualization";
import { getTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";

export const sceneSyncSystem: SceneSystem = (world, scene, dt): void => {
  animalSystem(world, scene, dt);
  positionSystem(world, scene, dt);
  materialSystem(world, scene, dt);
  shadowMapUpdateSystem(world, scene, dt);
  sunBackgroundSystem(world, scene, dt);
  // Runs after sunBackground so it can read the updated sun height.
  starfieldSystem(world, scene, dt);
  visualizationSystem(world, scene, dt);

  // Update terrain painting system with React UI state
  const terrainPaintingManager = getTerrainPaintingManager();
  if (terrainPaintingManager) {
    terrainPaintingManager.updateFromUI({
      enabled: world.terrainPaintingEnabled,
      brushMaterial: world.terrainBrushMaterial,
      brushRadius: world.terrainBrushRadius,
    });
  }
};
