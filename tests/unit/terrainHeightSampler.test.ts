import { expect, test } from "@playwright/test";
import { getMesh, MeshEnum, setMesh } from "src/scene/resources/mesh";
import { createTerrainGeometry } from "src/scene/resources/meshes/terrain";
import {
  getTerrainHeightAt,
  resetTerrainHeightSampler,
} from "src/scene/resources/meshes/terrainHeightSampler";
import { calculateHeight } from "src/terrainUtils";
import * as THREE from "three";

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

    const cellSize = terrainSize / segments;

    for (const [worldX, worldZ] of samples) {
      // world.x = local.x, world.z = -local.y  =>  local = (worldX, -worldZ)
      const sampled = getTerrainHeightAt(worldX, worldZ);
      expect(sampled).not.toBeNull();

      // The mesh only samples the analytic field once per vertex at 0.15 unit spacing,
      // so comparing straight against calculateHeight can no longer be tight: on rugged
      // terrain bilinear interpolation differs from the analytic height by up to ~0.17
      // (measured), which is far too loose to catch a weighting or half-cell bug.
      // Compare instead against the cell blend recomputed here from grid arithmetic, and
      // keep a loose analytic bound purely as a sanity check on the field itself.
      const localX = worldX;
      const localY = -worldZ;
      const cellIndexX = Math.floor((localX + halfSize) / cellSize);
      const cellIndexY = Math.floor((halfSize - localY) / cellSize);
      const weightX =
        (localX - localVertex(cellIndexX, cellIndexY).x) / cellSize;
      const weightY =
        (localVertex(cellIndexX, cellIndexY).y - localY) / cellSize;

      const cornerHeight = (dx: number, dy: number): number => {
        const vertex = localVertex(cellIndexX + dx, cellIndexY + dy);
        return calculateHeight(vertex.x, vertex.y);
      };

      const expectedBlend =
        cornerHeight(0, 0) * (1 - weightX) * (1 - weightY) +
        cornerHeight(1, 0) * weightX * (1 - weightY) +
        cornerHeight(0, 1) * (1 - weightX) * weightY +
        cornerHeight(1, 1) * weightX * weightY;

      expect(Math.abs((sampled as number) - expectedBlend)).toBeLessThan(1e-4);

      const cornerHeights = [
        cornerHeight(0, 0),
        cornerHeight(1, 0),
        cornerHeight(0, 1),
        cornerHeight(1, 1),
      ];
      // A bilinear sample has to sit inside its own cell's height range.
      expect(sampled as number).toBeGreaterThanOrEqual(
        Math.min(...cornerHeights) - 1e-4,
      );
      expect(sampled as number).toBeLessThanOrEqual(
        Math.max(...cornerHeights) + 1e-4,
      );

      // Analytic agreement, bounded by mesh curvature rather than rounding.
      expect(
        Math.abs((sampled as number) - calculateHeight(worldX, -worldZ)),
      ).toBeLessThan(0.2);
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

    const expected =
      (calculateHeight(a.x, a.y) +
        calculateHeight(b.x, b.y) +
        calculateHeight(c.x, c.y) +
        calculateHeight(d.x, d.y)) /
      4;

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
