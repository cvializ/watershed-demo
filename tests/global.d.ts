/**
 * Type declarations for window globals used in testing.
 * These are set up by tests/setup-test-globals.ts for browser-based tests.
 */

import type { TerrainStateManager } from "src/terrain/TerrainStateManager";
import type { Mesh } from "three";

declare global {
  interface Window {
    terrainStateManager?: TerrainStateManager;
    getTerrainMesh?: () => Mesh | null;
  }
}

// This file must be imported somewhere to make the declarations active
export {};
