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
   */
  paint: (
    x: number,
    y: number,
    materialType: SurfaceMaterialType,
    radius: number,
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
   * Get the current brush material type.
   */
  getBrushMaterial: () => SurfaceMaterialType;

  /**
   * Get the current brush radius.
   */
  getBrushRadius: () => number;
};

// Creates a terrain painter that wraps the surface material texture.
const createTerrainPainter = (
  paintFunction: (
    x: number,
    y: number,
    materialType: SurfaceMaterialType,
    radius: number,
  ) => void,
  clearFunction: () => void,
): TerrainPainter => {
  let currentMaterial: SurfaceMaterialType = "bareDirt";
  let currentRadius: number = 1.0; // Default brush radius in world units

  return {
    paint: (
      x: number,
      y: number,
      materialType?: SurfaceMaterialType,
      radius?: number,
    ): void => {
      const material = materialType ?? currentMaterial;
      const brushRadius = radius ?? currentRadius;

      paintFunction(x, y, material, brushRadius);
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

    getBrushMaterial: (): SurfaceMaterialType => {
      return currentMaterial;
    },

    getBrushRadius: (): number => {
      return currentRadius;
    },
  };
};

/**
 * Creates a terrain painter from a surface material texture manager.
 *
 * @param surfaceMaterialTexture - Surface material texture manager
 */
export const createTerrainPainterFromSurfaceMaterial =
  (surfaceMaterialTexture: {
    paint: (
      x: number,
      y: number,
      materialType: SurfaceMaterialType,
      radius: number,
    ) => void;
    clear: () => void;
  }): TerrainPainter => {
    return createTerrainPainter(
      surfaceMaterialTexture.paint.bind(surfaceMaterialTexture),
      surfaceMaterialTexture.clear.bind(surfaceMaterialTexture),
    );
  };
