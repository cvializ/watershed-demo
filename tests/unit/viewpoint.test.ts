import { expect, test } from "@playwright/test";
import { createWorld, hasComponent } from "bitecs";
import * as THREE from "three";

import { Orientation } from "src/components/components";
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

  test("a viewpoint records its aim as an orientation quaternion", () => {
    const world = createWorld(createGameWorldContext());

    const viewpoint$ = createViewpoint(world, {
      stand: { x: 5, z: 5 },
      look: { x: 0, z: 0 },
      name: "Aimed west",
    });

    const camera = requireCamera(viewpoint$);

    // The orientation component mirrors the placed camera's quaternion.
    expect(hasComponent(world, viewpoint$, Orientation)).toBe(true);
    expect(Orientation.x[viewpoint$]).toBeCloseTo(camera.quaternion.x, 5);
    expect(Orientation.y[viewpoint$]).toBeCloseTo(camera.quaternion.y, 5);
    expect(Orientation.z[viewpoint$]).toBeCloseTo(camera.quaternion.z, 5);
    expect(Orientation.w[viewpoint$]).toBeCloseTo(camera.quaternion.w, 5);

    // It is a unit quaternion whose forward axis points toward the look point
    // (the terrain under both points may tilt the aim, but it must face the
    // right way).
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion,
    );
    expect(forward.lengthSq()).toBeCloseTo(1, 5);

    const toLook = new THREE.Vector3()
      .set(0 - 5, 0, 0 - 5)
      .normalize();
    expect(forward.normalize().dot(toLook)).toBeGreaterThan(0.9);
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