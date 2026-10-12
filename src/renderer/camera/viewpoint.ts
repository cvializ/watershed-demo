import { hasComponent } from "bitecs";
import type * as THREE from "three";

import type { GameWorldContext } from "@/context";

import { Viewpoint } from "@/components/components";
import { getViewpointCamera } from "@/scene/resources/viewpoint";

/**
 * Resolve the first-person camera to render from, if a viewpoint is active.
 *
 * With no viewpoint active (`world.activeViewpoint$` is `-1`, the default), or
 * with a stale id (viewpoint deleted, or reset by a load), this returns
 * `undefined` and the caller keeps using the shared overhead orbit camera. When
 * a viewpoint owns a first-person camera that camera is returned, so the scene
 * is drawn as if standing at the viewpoint.
 */
export const resolveActiveViewpointCamera = (
  world: GameWorldContext,
): THREE.Camera | undefined => {
  const viewpoint$ = world.activeViewpoint$;
  if (viewpoint$ >= 0 && hasComponent(world, viewpoint$, Viewpoint)) {
    return getViewpointCamera(viewpoint$);
  }

  return undefined;
};