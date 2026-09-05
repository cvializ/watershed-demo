/**
 * Type declarations for window globals used in testing.
 * These are exposed in development by src/renderer/systems/init/simulation.ts
 * when the simulation initializes, and read by browser-based tests.
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
