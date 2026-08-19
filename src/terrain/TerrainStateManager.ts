import {
  cloneTerrainGeometryState,
  restoreTerrainGeometryState,
  saveTerrainGeometryState,
  type TerrainGeometryState,
} from "@/scene/resources/meshes/terrainGeometryState";

/**
 * Terrain state management for undo/redo and checkpoint functionality.
 * Provides a simple API for saving and restoring terrain geometry state.
 */
export interface TerrainStateManager {
  /** Save current terrain state to the undo stack */
  save: () => boolean;

  /** Undo last modification, restoring previous state */
  undo: () => boolean;

  /** Restore terrain from a specific saved state */
  restore: (state: TerrainGeometryState) => boolean;

  /** Get the current number of states in the undo stack */
  getUndoStackSize: () => number;

  /** Clear all saved states from the undo stack */
  clearUndoStack: () => void;

  /** Create a checkpoint (save state without adding to undo stack) */
  createCheckpoint: () => TerrainGeometryState | null;

  /** Restore from a checkpoint */
  restoreFromCheckpoint: (checkpoint: TerrainGeometryState) => boolean;

  /** Get current terrain state for debugging/verification */
  getCurrentState: () => TerrainGeometryState | null;
}

let _terrainStateManager: TerrainStateManager | null = null;
let undoStack: TerrainGeometryState[] = [];
const MAX_UNDO_STACK_SIZE = 20;
let checkpoint: TerrainGeometryState | null = null;

/**
 * Get the global terrain state manager instance.
 */
export const getTerrainStateManager = (): TerrainStateManager | null => {
  return _terrainStateManager;
};

/**
 * Create and initialize the global terrain state manager.
 */
export const createTerrainStateManager = (): TerrainStateManager => {
  if (_terrainStateManager) {
    return _terrainStateManager;
  }

  _terrainStateManager = {
    save: (): boolean => {
      const state = saveTerrainGeometryState();

      if (state) {
        // Clone and push to undo stack
        const clonedState = cloneTerrainGeometryState(state);
        undoStack.push(clonedState);

        // Limit stack size (FIFO)
        if (undoStack.length > MAX_UNDO_STACK_SIZE) {
          undoStack.shift();
        }

        return true;
      }

      return false;
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

    restore: (state: TerrainGeometryState): boolean => {
      try {
        restoreTerrainGeometryState(state);
        return true;
      } catch (error) {
        console.error("[terrain:state] Failed to restore state:", error);
        return false;
      }
    },

    getUndoStackSize: (): number => {
      return undoStack.length;
    },

    clearUndoStack: (): void => {
      // Clear all states from the stack
      undoStack = [];
    },

    createCheckpoint: (): TerrainGeometryState | null => {
      const state = saveTerrainGeometryState();

      if (state) {
        checkpoint = cloneTerrainGeometryState(state);
        return checkpoint;
      }

      return null;
    },

    restoreFromCheckpoint: (checkpointState: TerrainGeometryState): boolean => {
      try {
        restoreTerrainGeometryState(checkpointState);
        return true;
      } catch (error) {
        console.error(
          "[terrain:state] Failed to restore from checkpoint:",
          error,
        );
        return false;
      }
    },

    getCurrentState: (): TerrainGeometryState | null => {
      return saveTerrainGeometryState();
    },
  };

  return _terrainStateManager;
};
