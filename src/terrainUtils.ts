// Terrain height calculation utilities

/**
 * Calculate terrain height at a given position
 * Generates a flat plane with constant slope
 */
export function calculateHeight(x: number, z: number): number {
  // Constant slope plane: height increases with x and z
  const slopeX = 0.1; // Slope in X direction
  const slopeZ = 0.05; // Slope in Z direction
  return x * slopeX + z * slopeZ;
}
