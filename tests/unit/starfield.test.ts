import { test, expect } from "@playwright/test";
import * as THREE from "three";

import { createWorld } from "bitecs";
import { createGameWorldContext } from "src/context";
import { Position } from "src/components/components";
import { createStarfieldResource, getStarfieldResource } from "src/scene/resources/meshes/starfield";
import { createStarfield } from "src/world/factories/starfield";
import { starfieldSystem } from "src/scene/systems/starfield";
import { computeStarfieldOpacity } from "src/scene/systems/starfield";
import { MeshEnum } from "src/scene/resources/mesh";
import { getObject, setObject } from "src/scene/resources/objectCache";

test.describe("computeStarfieldOpacity", () => {
  test("returns 0 when the sun is well above the horizon (sunHeight = 10)", () => {
    const opacity = computeStarfieldOpacity(10);
    expect(opacity).toBe(0);
  });

  test("returns 0 when the sun is exactly at the fade threshold (sunHeight = 5)", () => {
    const opacity = computeStarfieldOpacity(5);
    expect(opacity).toBe(0);
  });

  test("returns 1 when the sun is at the horizon (sunHeight = 0)", () => {
    const opacity = computeStarfieldOpacity(0);
    expect(opacity).toBe(1);
  });

  test("returns 1 when the sun is below the horizon (sunHeight = -10)", () => {
    const opacity = computeStarfieldOpacity(-10);
    expect(opacity).toBe(1);
  });

  test("returns 0.5 when the sun is halfway to the horizon (sunHeight = 2.5)", () => {
    const opacity = computeStarfieldOpacity(2.5);
    expect(opacity).toBe(0.5);
  });
});

test.describe("createStarfieldResource", () => {
  test("returns a THREE.Points object", () => {
    const resource = createStarfieldResource();
    expect(resource).toBeInstanceOf(THREE.Points);
  });

  test("creates a point cloud with 20000 vertices", () => {
    const resource = createStarfieldResource();
    const geometry = resource.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position");
    expect(positions.count).toBe(20000);
  });

  test("positions stars on a sphere of radius 75", () => {
    const resource = createStarfieldResource();
    const geometry = resource.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const distance = Math.sqrt(x * x + y * y + z * z);
      // Allow a small floating-point tolerance
      expect(distance).toBeCloseTo(75, 0);
    }
  });
});

test.describe("starfieldSystem", () => {
  test("sets the starfield opacity based on sun height", () => {
    const context = createGameWorldContext();
    context.sunPosition = { x: 0, y: 0, z: 0 }; // Sun at horizon — full opacity
    const world = createWorld(context);
    setObject(MeshEnum.Starfield, createStarfieldResource());
    createStarfield(world);
    starfieldSystem(world, undefined as unknown as THREE.Scene, 0);
    const resource = getStarfieldResource();
    expect(resource.material.opacity).toBe(1);
  });

  test("sets starfield opacity to 0 when sun is above the horizon", () => {
    const context = createGameWorldContext();
    context.sunPosition = { x: 0, y: 10, z: 0 }; // Sun well above horizon — no stars
    const world = createWorld(context);
    setObject(MeshEnum.Starfield, createStarfieldResource());
    createStarfield(world);
    starfieldSystem(world, undefined as unknown as THREE.Scene, 0);
    const resource = getStarfieldResource();
    expect(resource.material.opacity).toBe(0);
  });

  test("interpolates opacity linearly when sun is between horizon and fade threshold", () => {
    const context = createGameWorldContext();
    context.sunPosition = { x: 0, y: 2.5, z: 0 }; // Halfway between horizon and fade threshold
    const world = createWorld(context);
    setObject(MeshEnum.Starfield, createStarfieldResource());
    createStarfield(world);
    starfieldSystem(world, undefined as unknown as THREE.Scene, 0);
    const resource = getStarfieldResource();
    expect(resource.material.opacity).toBe(0.5);
  });

  test("does not create a Position component (fixed sphere, not world-space object)", () => {
    const context = createGameWorldContext();
    const world = createWorld(context);
    setObject(MeshEnum.Starfield, createStarfieldResource());
    const starfieldEntity$ = createStarfield(world);
    // Starfield should NOT have a Position value (it's a fixed sphere, not a world-space object)
    expect(Position.x[starfieldEntity$]).toBeUndefined();
    expect(Position.y[starfieldEntity$]).toBeUndefined();
    expect(Position.z[starfieldEntity$]).toBeUndefined();
  });

  test("registers the starfield resource in the object cache", () => {
    const context = createGameWorldContext();
    const world = createWorld(context);
    setObject(MeshEnum.Starfield, createStarfieldResource());
    createStarfield(world);
    const cached = getObject(MeshEnum.Starfield);
    expect(cached).toBeDefined();
  });
});
