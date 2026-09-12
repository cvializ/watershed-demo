import type { RendererSystem } from "@/renderer/types";

import { updateControls } from "@/renderer/resources/camera";
import { updateKeyboardCamera } from "@/renderer/resources/keyboardCamera";
import { simulationSystem } from "@/renderer/systems/simulation";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getTerrainPaintingManager } from "@/terrain/TerrainPaintingManager";

export const rendererSyncSystem: RendererSystem = (
  world,
  scene,
  renderer,
  dt,
) => {
  simulationSystem(world, scene, renderer, dt);

  // Update terrain painting system
  const terrainPaintingManager = getTerrainPaintingManager();
  if (terrainPaintingManager) {
    terrainPaintingManager.update();
  }

  // Apply keyboard camera deltas first so they settle inside the same damping
  // step that OrbitControls runs below (auto-rotate, mouse pan, keyboard flight).
  updateKeyboardCamera(dt);

  // Update camera controls (auto-rotate and input handling)
  updateControls(dt);

  const camera = getObject(GeneralObjectEnum.Camera);
  renderer.render(scene, camera);
};
