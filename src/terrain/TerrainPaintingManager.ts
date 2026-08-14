import * as THREE from "three";

import type { SurfaceMaterialType } from "@/scene/resources/textures/surfaceMaterial";
import type { TerrainPainter } from "@/terrain/paintTerrain";

import {
  cloneTerrainGeometryState,
  restoreTerrainGeometryState,
  saveTerrainGeometryState,
  type TerrainGeometryState,
} from "@/scene/resources/mesh";
import {
  createTerrainPaintingSystem,
  type TerrainPaintingSystem,
} from "@/terrain/systems/terrainPaintingSystem";

/**
 * Centralized terrain painting manager.
 * Coordinates between React UI state and the painting system.
 */
export type TerrainPaintingManager = {
  /** Get the terrain painter instance */
  getTerrainPainter: () => TerrainPainter | null;

  /** Get the painting system instance */
  getPaintingSystem: () => TerrainPaintingSystem | null;

  /** Initialize the painting system with required dependencies */
  initialize: (params: {
    terrainPainter: TerrainPainter;
    camera: THREE.Camera;
    terrainMesh: THREE.Mesh;
  }) => void;

  /** Update from React UI state */
  updateFromUI: (params: {
    enabled: boolean;
    brushMaterial: SurfaceMaterialType;
    brushRadius: number;
    brushStrength: number;
  }) => void;

  /** Update in game loop */
  update: () => void;

  /** Get the material type under current cursor position */
  getMaterialUnderCursor: () => string | null;

  /** Save current terrain geometry state for undo/restore */
  saveTerrainState: () => TerrainGeometryState | null;

  /** Restore terrain geometry from saved state */
  restoreTerrainState: (state: TerrainGeometryState) => void;

  /** Undo last terrain modification by restoring previous state */
  undo: () => boolean;
};

/**
 * Global terrain painting manager instance.
 * This is a singleton that coordinates between React UI and the painting system.
 */
let _terrainPaintingManager: TerrainPaintingManager | null = null;
let terrainPainterInstance: TerrainPainter | null = null;
let paintingSystemInstance: TerrainPaintingSystem | null = null;

/** Undo stack for terrain state */
let undoStack: TerrainGeometryState[] = [];
const MAX_UNDO_STACK_SIZE = 10;

/**
 * Get the global terrain painting manager.
 */
export const getTerrainPaintingManager = (): TerrainPaintingManager | null => {
  return _terrainPaintingManager;
};

/**
 * Create and initialize the global terrain painting manager.
 */
export const createTerrainPaintingManager = (): TerrainPaintingManager => {
  if (_terrainPaintingManager) {
    return _terrainPaintingManager;
  }

  // Create painting system with default config
  paintingSystemInstance = createTerrainPaintingSystem({
    enabled: true,
    brushMaterial: "bareDirt",
    brushRadius: 2.0,
    brushStrength: 1.0,
  });

  _terrainPaintingManager = {
    getTerrainPainter: () => terrainPainterInstance,

    getPaintingSystem: () => paintingSystemInstance,

    initialize: ({
      terrainPainter,
      camera,
      terrainMesh,
    }: {
      terrainPainter: TerrainPainter;
      camera: THREE.Camera;
      terrainMesh: THREE.Mesh;
    }) => {
      // Use the passed terrain painter directly
      terrainPainterInstance = terrainPainter;

      // Set up painting system
      if (paintingSystemInstance && terrainPainterInstance) {
        paintingSystemInstance.setTerrainPainter(terrainPainterInstance);
        paintingSystemInstance.setCamera(camera);
        paintingSystemInstance.setTerrainMesh(terrainMesh);
      }
    },

    updateFromUI: ({
      enabled,
      brushMaterial,
      brushRadius,
      brushStrength,
    }: {
      enabled: boolean;
      brushMaterial: SurfaceMaterialType;
      brushRadius: number;
      brushStrength: number;
    }) => {
      if (paintingSystemInstance) {
        paintingSystemInstance.updateConfig({
          enabled,
          brushMaterial,
          brushRadius,
          brushStrength,
        });
      }
    },

    update: () => {
      if (paintingSystemInstance) {
        paintingSystemInstance.update();
      }
    },

    getMaterialUnderCursor: (): string | null => {
      if (!paintingSystemInstance) return null;
      const material = paintingSystemInstance.getMaterialUnderCursor();
      if (!material) return null;
      // Format material name for display (capitalize first letter)
      return material.charAt(0).toUpperCase() + material.slice(1);
    },

    saveTerrainState: (): TerrainGeometryState | null => {
      const state = saveTerrainGeometryState();
      if (state) {
        // Clone and push to undo stack
        const clonedState = cloneTerrainGeometryState(state);
        undoStack.push(clonedState);

        // Limit stack size
        if (undoStack.length > MAX_UNDO_STACK_SIZE) {
          undoStack.shift();
        }

        return state;
      }
      return null;
    },

    restoreTerrainState: (state: TerrainGeometryState): void => {
      restoreTerrainGeometryState(state);
    },

    undo: (): boolean => {
      if (undoStack.length === 0) {
        return false;
      }

      const previousState = undoStack.pop();
      if (previousState) {
        restoreTerrainGeometryState(previousState);
        return true;
      }

      return false;
    },
  };

  return _terrainPaintingManager;
};
