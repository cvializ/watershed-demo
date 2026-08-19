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
    baseHeight + Math.sin(x * frequency) * Math.cos(y * frequency) * scale;

  return height;
};
