/**
 * Surface material types for terrain
 * Stored as single-channel float texture (0.0, 1.0, 2.0)
 */
export const SurfaceMaterial = {
  BareDirt: 0,
  Grass: 1,
  Rocks: 2,
} as const;

export type SurfaceMaterialType = typeof SurfaceMaterial[keyof typeof SurfaceMaterial];

/**
 * Material properties that affect water flow
 */
export interface MaterialProperties {
  /**
   * Infiltration rate: how quickly water soaks into the ground (0-1)
   - Higher = more absorption, less surface flow
   */
  infiltrationRate: number;
  
  /**
   * Surface friction: affects water flow velocity (0.5-2.0)
   - Higher = slower flow
   */
  friction: number;
  
  /**
   * Base color for visualization
   */
  color: [number, number, number];
}

/**
 * Material properties lookup
 */
export const materialProperties: Record<number, MaterialProperties> = {
  [SurfaceMaterial.BareDirt]: {
    infiltrationRate: 0.5,
    friction: 1.0,
    color: [0.4, 0.3, 0.2], // Brownish
  },
  [SurfaceMaterial.Grass]: {
    infiltrationRate: 0.8,
    friction: 1.3, // Grass slows water flow
    color: [0.2, 0.6, 0.2], // Green
  },
  [SurfaceMaterial.Rocks]: {
    infiltrationRate: 0.2, // Rocks absorb less water
    friction: 0.8, // Smooth rocks allow faster flow
    color: [0.5, 0.5, 0.6], // Grayish
  },
};