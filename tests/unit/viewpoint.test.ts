import { expect, test } from "@playwright/test";
import { createWorld } from "bitecs";

import { createGameWorldContext } from "src/context";
import { resolveActiveViewpointCamera } from "src/renderer/camera/viewpoint";
import {
  getViewpointCamera,
  hasViewpointCamera,
} from "src/scene/resources/viewpoint";
import { createViewpoint } from "src/world/factories/viewpoint";

/** Assert a viewpoint owns a camera and return it (guards the optional type). */
const requireCamera = (entity$: number) => {
  const camera = getViewpointCamera(entity$);
  if (!camera) {
    throw new Error(`expected a first-person camera for ${entity$}`);
  }
  return camera;
};

test.describe("viewpoint", () => {
  test("a viewpoint owns a camera placed at its stand point", () => {
    const world = createWorld(createGameWorldContext());

    const viewpoint$ = createViewpoint(world, {
      stand: { x: 5, z: 5 },
      look: { x: 0, z: 0 },
      name: "Ridge",
    });

    expect(hasViewpointCamera(viewpoint$)).toBe(true);
    const camera = requireCamera(viewpoint$);

    // Camera sits on the stand column (x/z) at eye height above the terrain.
    expect(camera.position.x).toBe(5);
    expect(camera.position.z).toBe(5);

    // Not active yet, so nothing to render from.
    expect(resolveActiveViewpointCamera(world)).toBeUndefined();

    // Activate it and the resolver hands back the same camera.
    world.activeViewpoint$ = viewpoint$;
    expect(resolveActiveViewpointCamera(world)).toBe(camera);
  });

  test("two viewpoints keep separate cameras and switch independently", () => {
    const world = createWorld(createGameWorldContext());

    const east$ = createViewpoint(world, { stand: { x: 8, z: -2 }, look: { x: 0, z: 0 } });
    const west$ = createViewpoint(world, { stand: { x: -6, z: 7 }, look: { x: 0, z: 0 } });

    const eastCamera = requireCamera(east$);
    const westCamera = requireCamera(west$);
    expect(eastCamera).not.toBe(westCamera);

    world.activeViewpoint$ = east$;
    expect(resolveActiveViewpointCamera(world)).toBe(eastCamera);

    world.activeViewpoint$ = west$;
    expect(resolveActiveViewpointCamera(world)).toBe(westCamera);
  });

  test("a stale or inactive viewpoint id falls back to no camera", () => {
    const world = createWorld(createGameWorldContext());

    // Inactive.
    expect(resolveActiveViewpointCamera(world)).toBeUndefined();

    // Stale id that was never created.
    world.activeViewpoint$ = 999999;
    expect(resolveActiveViewpointCamera(world)).toBeUndefined();
  });

  test("a viewpoint placed at the scene centre still gets a valid view", () => {
    const world = createWorld(createGameWorldContext());

    // Stand and look both at the origin: the look point is pushed outward so
    // the camera is never aimed at its own feet (orientation stays non-NaN).
    const viewpoint$ = createViewpoint(world, {
      stand: { x: 0, z: 0 },
      look: { x: 0, z: 0 },
    });

    const camera = requireCamera(viewpoint$);

    // A degenerate lookAt would leave NaN in the world matrix.
    const matrix = camera.matrixWorld.elements;
    expect(matrix.every((value) => Number.isFinite(value))).toBe(true);
  });
});