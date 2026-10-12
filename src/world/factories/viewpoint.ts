import { addComponent, addEntity, type World } from "bitecs";
import type { PerspectiveCamera } from "three";

import {
  Name,
  Position,
  Viewpoint,
  ViewpointTarget,
} from "@/components/components";
import {
  createFirstPersonCamera,
  setViewpointCamera,
  VIEWPOINT_EYE_HEIGHT,
} from "@/scene/resources/viewpoint";
import { getTerrainHeightAt } from "@/scene/resources/meshes/terrainHeightSampler";

/**
 * Where a viewpoint stands and what it looks toward, in world X/Z.
 *
 * The camera's height is always derived from the terrain under the stand point
 * (plus an eye height), so a viewpoint keeps sitting on the ground even as the
 * terrain erodes or is painted; only the plan position is fixed here.
 */
export type ViewpointOptions = {
  /** Plan position the viewer stands at (world x/z). */
  stand: { x: number; z: number };
  /** Plan position the viewer looks toward (world x/z). Defaults to scene centre. */
  look?: { x: number; z: number };
  /** Label shown in the viewpoint picker. Defaults to "Viewpoint". */
  name?: string;
};

/**
 * Place a first-person camera standing at `standX/standZ` and aiming toward
 * `lookX/lookZ`, at an eye height above the (live) terrain surface.
 *
 * When the stand and look points nearly coincide (the viewer would be staring
 * at their own feet) the look point is pushed outward, away from the scene
 * centre, so there is always something to look at instead of a degenerate view.
 */
const placeViewpointCamera = (
  camera: PerspectiveCamera,
  standX: number,
  standZ: number,
  lookX: number,
  lookZ: number,
): void => {
  const standHeight = getTerrainHeightAt(standX, standZ) ?? 0;
  camera.position.set(standX, standHeight + VIEWPOINT_EYE_HEIGHT, standZ);

  // Aiming at your own feet is a degenerate view; push the target outward
  // along the line from the scene centre through the stand point instead.
  let targetX = lookX;
  let targetZ = lookZ;
  const toStand = Math.hypot(standX - targetX, standZ - targetZ);
  if (toStand < 2) {
    let outwardX = standX;
    let outwardZ = standZ - 10;
    const fromCentre = Math.hypot(standX, standZ);
    if (fromCentre >= 2) {
      outwardX = (standX / fromCentre) * (fromCentre + 10);
      outwardZ = (standZ / fromCentre) * (fromCentre + 10);
    }
    targetX = outwardX;
    targetZ = outwardZ;
  }

  const targetHeight = getTerrainHeightAt(targetX, targetZ) ?? 0;

  camera.up.set(0, 1, 0);
  camera.lookAt(targetX, targetHeight + VIEWPOINT_EYE_HEIGHT, targetZ);
  camera.updateMatrixWorld(true);
};

/**
 * Create a viewpoint entity in the world and give it its own first-person
 * camera.
 *
 * The entity carries the `Viewpoint` tag plus `Position`, `ViewpointTarget`
 * and `Name`, and owns a private `PerspectiveCamera` (via the per-entity cache)
 * that is placed on the terrain looking toward its target. Multiple viewpoints
 * can exist at once; only the one selected as active is ever rendered.
 *
 * @param world - The ECS world
 * @param options - Stand/look positions and an optional label
 * @returns The entity id of the created viewpoint
 */
export const createViewpoint = (
  world: World,
  options: ViewpointOptions,
): number => {
  const { stand, look, name } = options;
  const lookX = look ? look.x : 0;
  const lookZ = look ? look.z : 0;

  const entity$ = addEntity(world);

  addComponent(world, entity$, Viewpoint);

  addComponent(world, entity$, Position);
  Position.x[entity$] = stand.x;
  Position.y[entity$] =
    (getTerrainHeightAt(stand.x, stand.z) ?? 0) + VIEWPOINT_EYE_HEIGHT;
  Position.z[entity$] = stand.z;

  addComponent(world, entity$, ViewpointTarget);
  ViewpointTarget.x[entity$] = lookX;
  ViewpointTarget.y[entity$] =
    (getTerrainHeightAt(lookX, lookZ) ?? 0) + VIEWPOINT_EYE_HEIGHT;
  ViewpointTarget.z[entity$] = lookZ;

  addComponent(world, entity$, Name);
  Name.value[entity$] = name ?? "Viewpoint";

  // Create and place this viewpoint's own first-person camera now, so it is
  // ready to render from even if it is selected the very same frame it is made.
  const camera = createFirstPersonCamera();
  placeViewpointCamera(camera, stand.x, stand.z, lookX, lookZ);
  setViewpointCamera(entity$, camera);

  return entity$;
};