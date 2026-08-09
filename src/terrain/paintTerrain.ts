import type { SurfaceMaterialType } from "@/scene/resources/textures/surfaceMaterial";

/**
 * Terrain painter for applying surface materials to terrain.
 * Provides an API for painting different material types on the terrain.
 */
export type TerrainPainter = {
  /**
   * Paint a material on the terrain.
   * @param x - X coordinate in world space (0 to terrainSize)
   * @param y - Y coordinate in world space (0 to terrainSize)
   * @param materialType - Type of material to paint
   * @param radius - Brush radius in world units
   * @param strength - Painting strength (0-1, default 1.0)
   */
  paint: (
    x: number,
    y: number,
    materialType: SurfaceMaterialType,
    radius: number,
    strength?: number,
  ) => void;

  /**
   * Clear all materials and reset to bare dirt.
   */
  clear: () => void;

  /**
   * Set the current brush material type.
   */
  setBrushMaterial: (materialType: SurfaceMaterialType) => void;

  /**
   * Set the current brush radius.
   */
  setBrushRadius: (radius: number) => void;

  /**
   * Set the current brush strength.
   */
  setBrushStrength: (strength: number) => void;

  /**
   * Get the current brush material type.
   */
  getBrushMaterial: () => SurfaceMaterialType;

  /**
   * Get the current brush radius.
   */
  getBrushRadius: () => number;

  /**
   * Get the current brush strength.
   */
  getBrushStrength: () => number;
};

// Creates a terrain painter that wraps the surface material texture.
const createTerrainPainter = (
  paintFunction: (
    x: number,
    y: number,
    materialType: SurfaceMaterialType,
    radius: number,
    strength?: number,
  ) => void,
  clearFunction: () => void,
): TerrainPainter => {
  let currentMaterial: SurfaceMaterialType = "bareDirt";
  let currentRadius: number = 1.0; // Default brush radius in world units
  let currentStrength: number = 1.0; // Default painting strength

  return {
    paint: (
      x: number,
      y: number,
      materialType?: SurfaceMaterialType,
      radius?: number,
      strength?: number,
    ): void => {
      const material = materialType ?? currentMaterial;
      const brushRadius = radius ?? currentRadius;
      const paintStrength = strength ?? currentStrength;

      paintFunction(x, y, material, brushRadius, paintStrength);
    },

    clear: (): void => {
      clearFunction();
    },

    setBrushMaterial: (materialType: SurfaceMaterialType): void => {
      currentMaterial = materialType;
    },

    setBrushRadius: (radius: number): void => {
      currentRadius = radius;
    },

    setBrushStrength: (strength: number): void => {
      currentStrength = Math.max(0, Math.min(1, strength));
    },

    getBrushMaterial: (): SurfaceMaterialType => {
      return currentMaterial;
    },

    getBrushRadius: (): number => {
      return currentRadius;
    },

    getBrushStrength: (): number => {
      return currentStrength;
    },
  };
};

/**
 * Creates a terrain painter from a surface material texture manager.
 * 
 * @param surfaceMaterialTexture - Surface material texture manager
 */
export const createTerrainPainterFromSurfaceMaterial = (
  surfaceMaterialTexture: {
    paint: (
      x: number,
      y: number,
      materialType: SurfaceMaterialType,
      radius: number,
      strength?: number,
    ) => void;
    clear: () => void;
  },
): TerrainPainter => {
  return createTerrainPainter(
    surfaceMaterialTexture.paint.bind(surfaceMaterialTexture),
    surfaceMaterialTexture.clear.bind(surfaceMaterialTexture),
  );
};