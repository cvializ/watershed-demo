import { query } from "bitecs";
import * as THREE from "three";

import type { RendererInitSystem } from "@/renderer/types";

import { Viewpoint } from "@/components/components";
import { resolveActiveViewpointCamera } from "@/renderer/camera/viewpoint";
import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { createViewpoint } from "@/world/factories/viewpoint";
import { logger } from "@/utils/logger";

/**
 * Pointer travel (pixels) that still counts as a "click" for viewpoint
 * placement. A deliberate drag never places a viewpoint.
 */
const MAX_CLICK_DRAG_PX = 5;

/**
 * Left-click-to-place-viewpoint on the render canvas.
 *
 * Only active while `world.viewpointPlacementEnabled` (toggled from the
 * Viewpoints UI); otherwise the click passes through untouched so the usual
 * click tools (water sources) keep working.
 *
 * A click is raycast with whichever camera is currently rendering (a
 * first-person viewpoint camera when one is active, the shared overhead
 * camera otherwise). On a terrain hit a new `Viewpoint` is placed at the
 * clicked point, aimed back toward the current camera position, and becomes
 * the active viewpoint.
 */
export const viewpointPlacementInitSystem: RendererInitSystem = (
  world,
  _scene,
  renderer,
) => {
  const canvas: HTMLElement = renderer.domElement;

  let lastMouseDown: { x: number; y: number } | null = null;

  canvas.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0) {
      lastMouseDown = null;
      return;
    }

    lastMouseDown = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("click", (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!world.viewpointPlacementEnabled) {
      return;
    }

    // A drag that ends on the canvas is not a click.
    if (lastMouseDown) {
      const dragDistance = Math.hypot(
        event.clientX - lastMouseDown.x,
        event.clientY - lastMouseDown.y,
      );
      if (dragDistance > MAX_CLICK_DRAG_PX) {
        return;
      }
    }
    lastMouseDown = null;

    // Raycast against the camera the scene is currently rendered from.
    const camera =
      resolveActiveViewpointCamera(world) ??
      (getObject(GeneralObjectEnum.Camera) as THREE.Camera);
    const terrainMesh = getMesh(MeshEnum.Terrain);
    if (!camera || !terrainMesh) {
      return;
    }

    const ndc = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const [hit] = raycaster.intersectObject(terrainMesh);
    if (!hit) {
      return;
    }

    // The new viewer stands at the clicked point and looks back at the
    // camera position (its x/z), so the placed viewpoint always has the
    // person who created it in frame. If the camera is nearly straight above
    // the click, the factory's degenerate-look fallback pushes the view
    // outward instead of at the viewer's own feet.
    const entity$ = createViewpoint(world, {
      stand: { x: hit.point.x, z: hit.point.z },
      look: { x: camera.position.x, z: camera.position.z },
      name: `Viewpoint ${Array.from(query(world, [Viewpoint])).length + 1}`,
    });

    world.activeViewpoint$ = entity$;

    logger.info(
      { x: hit.point.x, z: hit.point.z, entity$ },
      "[viewpoint:placed] left-click on terrain",
    );
  });
};