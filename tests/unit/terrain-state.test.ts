import { expect, test } from "@playwright/test";

import type { TerrainGeometryState } from "src/scene/resources/meshes/terrainGeometryState";
import { cloneTerrainGeometryState } from "src/scene/resources/meshes/terrainGeometryState";

test.describe("Terrain State Management", () => {
  test("should create a deep clone of terrain state", () => {
    const originalPositions = new Float32Array([1, 2, 3, 4, 5, 6]);
    const originalUvs = new Float32Array([0.1, 0.2, 0.3, 0.4]);

    const original: TerrainGeometryState = {
      positions: originalPositions,
      uv: originalUvs,
    };

    const cloned = cloneTerrainGeometryState(original);

    // Should have same values
    expect(cloned.positions).toEqual(originalPositions);
    expect(cloned.uv).toEqual(originalUvs);

    // But should be different instances
    expect(cloned.positions).not.toBe(originalPositions);
    expect(cloned.uv).not.toBe(originalUvs);

    // Modifying clone should not affect original
    cloned.positions[0] = 999;
    expect(originalPositions[0]).toBe(1);
  });

  test("should handle state without UV coordinates", () => {
    const original: TerrainGeometryState = {
      positions: new Float32Array([1, 2, 3]),
    };

    const cloned = cloneTerrainGeometryState(original);

    expect(cloned.positions).toEqual(new Float32Array([1, 2, 3]));
    expect(cloned.uv).toBeUndefined();
  });

  test("should handle empty state clone", () => {
    const original: TerrainGeometryState = {
      positions: new Float32Array([]),
    };

    const cloned = cloneTerrainGeometryState(original);

    expect(cloned.positions).toEqual(new Float32Array([]));
    expect(cloned.positions.length).toBe(0);
  });

  test("should clone large state efficiently", () => {
    const largePositions = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) {
      largePositions[i] = i;
    }

    const original: TerrainGeometryState = {
      positions: largePositions,
    };

    const cloned = cloneTerrainGeometryState(original);

    expect(cloned.positions.length).toBe(1000);
    expect(cloned.positions).not.toBe(largePositions);
    
    // Verify all values are copied correctly
    for (let i = 0; i < 1000; i++) {
      expect(cloned.positions[i]).toBe(i);
    }
  });
});