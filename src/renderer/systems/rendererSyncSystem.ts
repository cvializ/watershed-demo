import type { RendererSystem } from "@/renderer/types";

import { updateControls } from "@/renderer/resources/camera";
import { updateKeyboardCamera } from "@/renderer/resources/keyboardCamera";
import { resolveActiveViewpointCamera } from "@/renderer/camera/viewpoint";
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

  // Render from the active first-person viewpoint if one is selected, otherwise
  // from the shared overhead orbit camera. Controls only drive the default
  // camera, so an active viewpoint stays exactly where it was placed.
  const camera =
    resolveActiveViewpointCamera(world) ?? getObject(GeneralObjectEnum.Camera);
  renderer.render(scene, camera);
};
