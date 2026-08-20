import { expect, test } from "@playwright/test";
import * as THREE from "three";

import { calculateHeight } from "src/terrainUtils";
import { getMesh, MeshEnum, setMesh } from "src/scene/resources/mesh";
import { createTerrainGeometry } from "src/scene/resources/meshes/terrain";
import {
  getTerrainHeightAt,
  resetTerrainHeightSampler,
} from "src/scene/resources/meshes/terrainHeightSampler";

const terrainSize = 12;
const halfSize = terrainSize / 2;
const segments = 80;

/** Local plane vertex position for grid coordinates (ix, iy). */
const localVertex = (ix: number, iy: number) => ({
  x: -halfSize + ix * (terrainSize / segments),
  y: halfSize - iy * (terrainSize / segments),
});

/** World (x, z) for a grid vertex: world.x = local.x, world.z = -local.y. */
const worldVertex = (ix: number, iy: number) => {
  const vertex = localVertex(ix, iy);
  return { worldX: vertex.x, worldZ: -vertex.y };
};

test.describe("getTerrainHeightAt", () => {
  test.beforeEach(() => {
    resetTerrainHeightSampler();
    const geometry = createTerrainGeometry();
    const terrainMesh = new THREE.Mesh(geometry);
    terrainMesh.rotation.x = -Math.PI / 2;
    setMesh(MeshEnum.Terrain, terrainMesh);
  });

  test("matches the stored vertex height at grid points", () => {
    for (const [ix, iy] of [
      [0, 0],
      [10, 10],
      [40, 40],
      [80, 80],
      [25, 60],
    ]) {
      const { worldX, worldZ } = worldVertex(ix, iy);
      const vertex = localVertex(ix, iy);
      const expected = calculateHeight(vertex.x, vertex.y);
      const sampled = getTerrainHeightAt(worldX, worldZ);
      expect(sampled).not.toBeNull();
      expect(sampled as number).toBeCloseTo(expected, 5);
    }
  });

  test("matches calculateHeight for arbitrary interior points", () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [3.2, -1.7],
      [-4.5, 2.3],
      [1.1, 5.9],
      [-0.2, -0.9],
    ];

    for (const [worldX, worldZ] of samples) {
      // world.x = local.x, world.z = -local.y  =>  local = (worldX, -worldZ)
      const expected = calculateHeight(worldX, -worldZ);
      const sampled = getTerrainHeightAt(worldX, worldZ);
      expect(sampled).not.toBeNull();
      expect(sampled as number).toBeCloseTo(expected, 4);
    }
  });

  test("bilinearly interpolates between four surrounding vertices", () => {
    // A point exactly halfway between grid vertices (10,10), (11,10),
    // (10,11), (11,11).
    const a = localVertex(10, 10);
    const b = localVertex(11, 10);
    const c = localVertex(10, 11);
    const d = localVertex(11, 11);
    const midLocalX = (a.x + b.x) / 2;
    const midLocalY = (a.y + c.y) / 2;
    const worldX = midLocalX;
    const worldZ = -midLocalY;

    const expected = (
      calculateHeight(a.x, a.y) +
      calculateHeight(b.x, b.y) +
      calculateHeight(c.x, c.y) +
      calculateHeight(d.x, d.y)
    ) / 4;

    const sampled = getTerrainHeightAt(worldX, worldZ);
    expect(sampled).not.toBeNull();
    expect(sampled as number).toBeCloseTo(expected, 4);
  });

  test("clamps out-of-bounds positions to the terrain edge", () => {
    // Far outside the terrain on the +x/+z corner.
    const far = getTerrainHeightAt(100, 100);
    const corner = getTerrainHeightAt(halfSize, halfSize);
    expect(far).not.toBeNull();
    expect(corner).not.toBeNull();
    // Both should resolve to the same clamped corner vertex height.
    expect(far as number).toBeCloseTo(corner as number, 5);
  });

  test("reflects live geometry height changes (no stale cache)", () => {
    const base = getTerrainHeightAt(0, 0) as number;
    expect(base).not.toBeNull();

    // Mutate the shared geometry so the center vertex rises.
    const geometry = getMesh(MeshEnum.Terrain).geometry as THREE.BufferGeometry;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const centerIndex = Math.floor(positions.count / 2);
    positions.setZ(centerIndex, 5.5);
    positions.needsUpdate = true;

    // The cached sampler reads the live array, so the change is visible.
    const raised = getTerrainHeightAt(0, 0) as number;
    expect(raised).toBeCloseTo(5.5, 5);
  });
});