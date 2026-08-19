/**
 * Test utility to set up window globals for browser-based tests.
 * This file should be imported in test files that need access to
 * terrainStateManager and getTerrainMesh via window object.
 */

import { getTerrainMesh } from "src/scene/resources/mesh";
import { getTerrainStateManager } from "src/terrain/TerrainStateManager";

/**
 * Set up window globals for testing purposes.
 * Must be called after the simulation has been initialized.
 */
export const setupTestGlobals = (): void => {
  if (typeof window !== "undefined") {
    // Type assertion to allow setting these properties
    const win = window as unknown as {
      terrainStateManager?: import("src/terrain/TerrainStateManager").TerrainStateManager;
      getTerrainMesh?: () => import("three").Mesh | null;
    };

    win.terrainStateManager = getTerrainStateManager() ?? undefined;
    win.getTerrainMesh = getTerrainMesh;
  }
};

/**
 * Clean up window globals after tests.
 */
export const cleanupTestGlobals = (): void => {
  if (typeof window !== "undefined") {
    const win = window as unknown as {
      terrainStateManager?: unknown;
      getTerrainMesh?: unknown;
    };

    delete win.terrainStateManager;
    delete win.getTerrainMesh;
  }
};
