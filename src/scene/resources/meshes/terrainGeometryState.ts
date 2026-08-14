import * as THREE from "three";

import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

/**
 * Interface for storing terrain mesh geometry state
 */
export interface TerrainGeometryState {
  positions: Float32Array;
  uv?: Float32Array;
}

/**
 * Save the current terrain mesh geometry state
 * Returns a deep copy of the position data that can be restored later
 */
export const saveTerrainGeometryState = (): TerrainGeometryState | null => {
  const terrainMesh = getMesh(MeshEnum.Terrain);

  if (!terrainMesh) {
    logger.warn(
      "[terrain:state] Terrain mesh not found, cannot save state",
    );
    return null;
  }

  const geometry = terrainMesh.geometry as THREE.BufferGeometry;
  const positions = geometry.attributes.position;

  // Create a deep copy of the position data
  const positionsCopy = new Float32Array(positions.count * 3);
  positionsCopy.set(positions.array as Float32Array);

  // Also copy UV coordinates if available
  let uvCopy: Float32Array | undefined;
  if (geometry.attributes.uv) {
    const uv = geometry.attributes.uv;
    uvCopy = new Float32Array(uv.count * 2);
    uvCopy.set(uv.array as Float32Array);
  }

  logger.info(
    { vertexCount: positions.count },
    "[terrain:state] Saved terrain geometry state",
  );

  return {
    positions: positionsCopy,
    uv: uvCopy,
  };
};

/**
 * Restore terrain mesh geometry from a saved state
 * @param state - The saved terrain geometry state to restore
 */
export const restoreTerrainGeometryState = (
  state: TerrainGeometryState,
): void => {
  const terrainMesh = getMesh(MeshEnum.Terrain);
  const wireframeOverlay = getMesh(MeshEnum.TerrainWireframeOverlay);

  if (!terrainMesh) {
    logger.warn(
      "[terrain:state] Terrain mesh not found, cannot restore state",
    );
    return;
  }

  const geometry = terrainMesh.geometry as THREE.BufferGeometry;
  const positions = geometry.attributes.position;

  // Restore position data
  if (state.positions.length === positions.count * 3) {
    positions.array.set(state.positions);
    positions.needsUpdate = true;

    // Recalculate normals after restoring positions
    geometry.computeVertexNormals();

    logger.info(
      { vertexCount: positions.count },
      "[terrain:state] Restored terrain geometry state",
    );
  } else {
    logger.warn(
      {
        savedLength: state.positions.length,
        requiredLength: positions.count * 3,
      },
      "[terrain:state] Position data length mismatch, cannot restore",
    );
  }

  // Also update wireframe overlay if it exists and shares the same geometry
  if (wireframeOverlay) {
    const wireframeGeometry = wireframeOverlay.geometry as THREE.BufferGeometry;

    // Check if it's the same geometry instance (shared reference)
    if (wireframeGeometry === geometry) {
      logger.debug(
        "[terrain:state] Wireframe overlay shares geometry, automatically updated",
      );
    } else {
      // If it's a different geometry instance, copy the positions
      const wireframePositions = wireframeGeometry.attributes.position;

      if (wireframePositions.count === positions.count) {
        wireframePositions.array.set(positions.array);
        wireframePositions.needsUpdate = true;
        wireframeGeometry.computeVertexNormals();

        logger.debug(
          "[terrain:state] Wireframe overlay geometry restored",
        );
      }
    }
  }
};

/**
 * Create a deep clone of terrain geometry state
 * Useful for creating checkpoints or undo stacks
 */
export const cloneTerrainGeometryState = (
  state: TerrainGeometryState,
): TerrainGeometryState => {
  const cloned: TerrainGeometryState = {
    positions: new Float32Array(state.positions.length),
  };

  cloned.positions.set(state.positions);

  if (state.uv) {
    cloned.uv = new Float32Array(state.uv.length);
    cloned.uv.set(state.uv);
  }

  return cloned;
};