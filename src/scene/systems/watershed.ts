import * as THREE from "three";

import type { SceneSystem } from "@/scene/types";

import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import {
  createWatershedHighlightManager,
  getWatershedHighlightManager,
} from "@/terrain/WatershedHighlightManager";
import { logger } from "@/utils/logger";

/**
 * Runs the watershed highlight each frame: traces the area drained by the
 * terrain point under the mouse and paints it red, when the tool is enabled.
 */
export const watershedSystem: SceneSystem = (world, scene, _dt) => {
  let manager = getWatershedHighlightManager();
  if (!manager) {
    manager = createWatershedHighlightManager();
  }

  // Nothing to do while the tool is off (also hides any lingering overlay).
  if (!world.watershedHighlight) {
    manager.updateFromUI({ enabled: false });
    manager.update();
    return;
  }

  // Look up the live scene objects from their caches; `getObject`/`getMesh`
  // throw until scene + world init have populated them, so guard.
  let camera: THREE.Camera | null = null;
  let terrainMesh: THREE.Mesh | null = null;
  try {
    camera = getObject(GeneralObjectEnum.Camera) as THREE.Camera;
    terrainMesh = getMesh(MeshEnum.Terrain);
  } catch {
    // Camera/terrain not ready yet — nothing to trace this frame.
    return;
  }

  // Wire the manager to the scene (idempotent per terrain geometry), then
  // recompute the highlight for the point under the cursor.
  manager.initialize({ camera, terrainMesh, scene });
  manager.updateFromUI({ enabled: true });
  manager.update();

  logger.debug(`[watershed] highlighting=${manager.isHighlighting()}`);
};