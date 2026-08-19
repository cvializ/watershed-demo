import { createWorld } from "bitecs";
import { expect, test } from "@playwright/test";
import * as THREE from "three";

import { createGameWorldContext } from "src/context";
import {
  createMeshInstance,
  disposeMeshInstance,
  getMeshInstance,
  hasMeshInstanceFactory,
  registerMeshInstanceFactory,
  resetMeshInstances,
  resolveEntityMesh,
} from "src/scene/resources/meshInstances";
import { createAnimalMeshResource } from "src/scene/resources/meshes/animal";
import { MeshEnum } from "src/scene/resources/mesh";
import { initRenderables } from "src/scene/systems/init/renderable";
import { positionSystem } from "src/scene/systems/position";
import { createAnimal } from "src/world/factories/animal";

test.describe("meshInstances", () => {
  test.beforeEach(() => {
    resetMeshInstances();
    registerMeshInstanceFactory(MeshEnum.Animal, createAnimalMeshResource);
  });

  test("detects which mesh types need per-entity instances", () => {
    expect(hasMeshInstanceFactory(MeshEnum.Animal)).toBe(true);
    expect(hasMeshInstanceFactory(MeshEnum.Terrain)).toBe(false);
  });

  test("creates a distinct instance per entity", () => {
    const first = createMeshInstance(100, MeshEnum.Animal);
    const second = createMeshInstance(200, MeshEnum.Animal);

    expect(first).toBeInstanceOf(THREE.Mesh);
    expect(first).not.toBe(second);
    expect(getMeshInstance(100)).toBe(first);
    expect(getMeshInstance(200)).toBe(second);
  });

  test("resolveEntityMesh returns the entity's own instance", () => {
    const instance = createMeshInstance(100, MeshEnum.Animal);
    expect(resolveEntityMesh(100, MeshEnum.Animal)).toBe(instance);
  });

  test("disposeMeshInstance drops the tracked instance", () => {
    createMeshInstance(100, MeshEnum.Animal);
    disposeMeshInstance(100);
    expect(getMeshInstance(100)).toBeUndefined();
  });

  test("each animal renderable gets its own mesh at its own position", () => {
    const world = createWorld(createGameWorldContext());
    const scene = new THREE.Scene();

    // Observers must be registered before entities exist (sceneInit -> worldInit)
    initRenderables(world, scene);

    createAnimal(world, -3, 0.5, -3);
    createAnimal(world, 3, 0.5, 3);
    createAnimal(world, 0, 0.5, 0);

    // Each animal should have added a distinct mesh object to the scene
    const animalMeshes = scene.children.filter(
      (child) => (child as THREE.Mesh).isMesh === true,
    );
    expect(animalMeshes.length).toBe(3);
    expect(new Set(animalMeshes).size).toBe(3);

    // Positioning must target each animal's own instance
    positionSystem(world, scene, 0.016);

    const positions = animalMeshes
      .slice()
      .sort((a, b) => a.position.x - b.position.x)
      .map((mesh) => [mesh.position.x, mesh.position.z]);
    expect(positions).toEqual([
      [-3, -3],
      [0, 0],
      [3, 3],
    ]);
  });
});