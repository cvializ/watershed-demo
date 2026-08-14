import * as THREE from "three";
import { expect, test } from "@playwright/test";

import type { TerrainGeometryState } from "src/terrainUtils";
import { cloneTerrainGeometryState, restoreTerrainGeometryState, saveTerrainGeometryState } from "src/terrainUtils";

test.describe("Terrain State Management", () => {
  test("should save terrain geometry state correctly", () => {
    // Create a mock terrain mesh with simple geometry
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);

    const mockGeometry = {
      attributes: {
        position: {
          count: 3,
          array: positions,
          needsUpdate: false,
        },
        uv: {
          count: 3,
          array: uvs,
          needsUpdate: false,
        },
      },
    } as unknown as THREE.BufferGeometry;

    const mockMesh = {
      geometry: mockGeometry,
    } as unknown as THREE.Mesh;

    const state = saveTerrainGeometryState(mockMesh);

    expect(state).not.toBeNull();
    expect(state?.positions.length).toBe(9); // 3 vertices × 3 components
    expect(state?.uv?.length).toBe(6); // 3 vertices × 2 components
  });

  test("should restore terrain geometry state correctly", () => {
    // Create initial positions
    const originalPositions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const modifiedPositions = new Float32Array([10, 10, 10, 11, 10, 10, 10, 11, 10]);

    const mockGeometry = {
      attributes: {
        position: {
          count: 3,
          array: modifiedPositions,
          needsUpdate: false,
        },
      },
      computeVertexNormals: () => {},
    } as unknown as THREE.BufferGeometry;

    const mockMesh = {
      geometry: mockGeometry,
    } as unknown as THREE.Mesh;

    const state: TerrainGeometryState = {
      positions: originalPositions,
    };

    restoreTerrainGeometryState(mockMesh, state);

    // Check that positions were restored
    expect(modifiedPositions[0]).toBe(0);
    expect(modifiedPositions[1]).toBe(0);
    expect(modifiedPositions[2]).toBe(0);
  });

  test("should handle state with mismatched length gracefully", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const shortState: TerrainGeometryState = {
      positions: new Float32Array([1, 2, 3]), // Too short
    };

    const mockGeometry = {
      attributes: {
        position: {
          count: 3,
          array: positions,
          needsUpdate: false,
        },
      },
    } as unknown as THREE.BufferGeometry;

    const mockMesh = {
      geometry: mockGeometry,
    } as unknown as THREE.Mesh;

    // Should not throw error
    expect(() => restoreTerrainGeometryState(mockMesh, shortState)).not.toThrow();

    // Positions should remain unchanged
    expect(positions[0]).toBe(0);
  });

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
});