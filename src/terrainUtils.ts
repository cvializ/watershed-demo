import * as THREE from "three";

/**
 * Calculate height for terrain at a given position.
 * Creates a flat slope terrain with gentle undulations.
 */
export const calculateHeight = (x: number, y: number): number => {
  // Flat slope with gentle gradient
  const baseHeight = -0.5;

  // Add subtle undulations for visual interest
  const scale = 0.3;
  const frequency = 0.15;

  const height =
    baseHeight +
    Math.sin(x * frequency) * Math.cos(y * frequency) * scale;

  return height;
};

/**
 * Save terrain mesh geometry state for later restoration.
 * Returns a deep copy of the position data that can be restored later.
 */
export const saveTerrainGeometryState = (
  terrainMesh: THREE.Mesh,
): TerrainGeometryState | null => {
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

  return {
    positions: positionsCopy,
    uv: uvCopy,
  };
};

/**
 * Interface for storing terrain mesh geometry state
 */
export interface TerrainGeometryState {
  positions: Float32Array;
  uv?: Float32Array;
}

/**
 * Restore terrain mesh geometry from a saved state.
 * @param terrainMesh - The terrain mesh to restore
 * @param state - The saved terrain geometry state to restore
 */
export const restoreTerrainGeometryState = (
  terrainMesh: THREE.Mesh,
  state: TerrainGeometryState,
): void => {
  const geometry = terrainMesh.geometry as THREE.BufferGeometry;
  const positions = geometry.attributes.position;

  // Restore position data
  if (state.positions.length === positions.count * 3) {
    positions.array.set(state.positions);
    positions.needsUpdate = true;

    // Recalculate normals after restoring positions
    geometry.computeVertexNormals();
  }
};

/**
 * Create a deep clone of terrain geometry state.
 * Useful for creating checkpoints or undo stacks.
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