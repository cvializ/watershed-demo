import * as THREE from "three";

/**
 * Surface material types for terrain painting.
 * Each material has different properties that affect water flow.
 */
export type SurfaceMaterialType = "bareDirt" | "grass" | "rocks";

// Material properties that affect water flow simulation.
type MaterialProperties = {
  /** Infiltration rate: how quickly water soaks into the ground (0-1) */
  infiltrationRate: number;

  /** Friction coefficient: how much the material slows water flow (higher = slower) */
  frictionCoefficient: number;

  /** Visual color for the material */
  color: [number, number, number];
};

// Material type to properties mapping.
const MATERIAL_PROPERTIES: Record<SurfaceMaterialType, MaterialProperties> = {
  bareDirt: {
    infiltrationRate: 0.5, // Moderate absorption
    frictionCoefficient: 1.0, // Normal flow speed
    color: [0.4, 0.3, 0.2], // Brownish
  },
  grass: {
    infiltrationRate: 0.8, // High absorption (grass soaks up water)
    frictionCoefficient: 1.3, // Higher friction (slows water down)
    color: [0.2, 0.6, 0.2], // Green
  },
  rocks: {
    infiltrationRate: 0.2, // Low absorption (water runs off)
    frictionCoefficient: 0.8, // Lower friction (faster flow on smooth rocks)
    color: [0.5, 0.5, 0.6], // Grayish
  },
};

// Material type to numeric ID mapping for shader usage.
const MATERIAL_TYPE_IDS: Record<SurfaceMaterialType, number> = {
  bareDirt: 0.0,
  grass: 1.0,
  rocks: 2.0,
};

/**
 * Surface material texture manager.
 * Handles creation and painting of surface material textures.
 */
export type SurfaceMaterialTexture = {
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
   * Get the surface material texture.
   */
  getTexture: () => THREE.Texture;

  /**
   * Get the material properties for a specific type.
   */
  getMaterialProperties: (
    materialType: SurfaceMaterialType,
  ) => MaterialProperties;

  /**
   * Get the material type at a specific world position.
   * @param x - X coordinate in world space (0 to terrainSize)
   * @param y - Y coordinate in world space (0 to terrainSize)
   * @returns The material type at that position
   */
  getMaterialAtPosition: (x: number, y: number) => SurfaceMaterialType;

  /**
   * Save the surface material texture to localStorage.
   * @param key - Storage key (default: "terrainSurfaceMaterials")
   * @returns true if successful, false otherwise
   */
  save: (key?: string) => boolean;

  /**
   * Load the surface material texture from localStorage.
   * @param key - Storage key (default: "terrainSurfaceMaterials")
   * @returns true if successful, false if no saved data found
   */
  load: (key?: string) => boolean;

  /**
   * Export surface material data as a JSON object.
   * @returns JSON object containing material data
   */
  exportToJson: () => string;

  /**
   * Import surface material data from a JSON object.
   * @param jsonData - JSON string containing material data
   * @returns true if successful, false otherwise
   */
  importFromJson: (jsonData: string) => boolean;
};

/**
 * Creates a surface material texture for terrain painting.
 * The texture stores material type information that affects water flow simulation.
 *
 * Texture format:
 * - R channel: Material type ID (0.0 = bareDirt, 1.0 = grass, 2.0 = rocks)
 * - G channel: Reserved for future use
 * - B channel: Reserved for future use
 * - A channel: Alpha (always 1.0)
 *
 * @param size - Texture resolution (should match simulation grid size)
 * @param terrainSize - Physical size of the terrain in world units
 */
export const createSurfaceMaterialTexture = (
  size: number,
  terrainSize: number,
): SurfaceMaterialTexture => {
  // Create data array (RGBA float32)
  const data = new Float32Array(size * size * 4);

  // Initialize with grass (material type ID = 1.0)
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = MATERIAL_TYPE_IDS.grass; // R: material type
    data[i * 4 + 1] = 0.0; // G: reserved
    data[i * 4 + 2] = 0.0; // B: reserved
    data[i * 4 + 3] = 1.0; // A: alpha
  }

  // Create texture
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;

  // Convert world coordinates to texture UV
  const worldToUV = (x: number, y: number): { u: number; v: number } => {
    const u = x / terrainSize;
    const v = 1.0 - y / terrainSize; // Flip Y to match terrain coordinates
    return { u, v };
  };

  return {
    paint: (
      x: number,
      y: number,
      materialType: SurfaceMaterialType,
      radius: number,
    ): void => {
      const { u, v } = worldToUV(x, y);
      const materialId = MATERIAL_TYPE_IDS[materialType];

      // Paint in a circular brush
      const radiusPixels = (radius / terrainSize) * size;
      const radiusSquared = radiusPixels * radiusPixels;

      const centerX = u * (size - 1);
      const centerY = v * (size - 1);

      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const dx = px - centerX;
          const dy = py - centerY;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared <= radiusSquared) {
            // Discrete painting: directly set the material ID with no blending
            const index = py * size + px;
            data[index * 4 + 0] = materialId;
          }
        }
      }

      texture.needsUpdate = true;
    },

    clear: (): void => {
      for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = MATERIAL_TYPE_IDS.grass;
        data[i * 4 + 1] = 0.0;
        data[i * 4 + 2] = 0.0;
        data[i * 4 + 3] = 1.0;
      }
      texture.needsUpdate = true;
    },

    getTexture: (): THREE.Texture => {
      return texture;
    },

    getMaterialProperties: (type: SurfaceMaterialType): MaterialProperties => {
      return MATERIAL_PROPERTIES[type];
    },

    getMaterialAtPosition: (x: number, y: number): SurfaceMaterialType => {
      // Convert world coordinates to texture UV
      const u = x / terrainSize;
      const v = 1.0 - y / terrainSize; // Flip Y

      // Clamp to valid range
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = Math.max(0, Math.min(1, v));

      // Convert to pixel coordinates
      const pixelX = Math.floor(clampedU * (size - 1));
      const pixelY = Math.floor(clampedV * (size - 1));

      // Get material ID from data array
      const index = pixelY * size + pixelX;
      const materialId = data[index * 4 + 0];

      // Convert material ID to type using exact thresholds for discrete values
      if (materialId === MATERIAL_TYPE_IDS.bareDirt) {
        return "bareDirt";
      } else if (materialId === MATERIAL_TYPE_IDS.grass) {
        return "grass";
      } else {
        return "rocks";
      }
    },

    save: (key: string = "terrainSurfaceMaterials"): boolean => {
      try {
        const exportData = {
          size,
          terrainSize,
          data: Array.from(data),
        };
        const jsonString = JSON.stringify(exportData);
        localStorage.setItem(key, jsonString);
        return true;
      } catch (error) {
        console.error("Failed to save surface materials:", error);
        return false;
      }
    },

    load: (key: string = "terrainSurfaceMaterials"): boolean => {
      try {
        const jsonString = localStorage.getItem(key);
        if (!jsonString) {
          return false;
        }

        const importData = JSON.parse(jsonString) as {
          size: number;
          terrainSize: number;
          data: number[];
        };

        // Validate imported data
        if (
          importData.size !== size ||
          importData.terrainSize !== terrainSize ||
          !Array.isArray(importData.data)
        ) {
          console.error("Invalid surface material data format");
          return false;
        }

        // Restore data array
        for (let i = 0; i < size * size * 4; i++) {
          data[i] = importData.data[i] ?? 0;
        }

        texture.needsUpdate = true;
        return true;
      } catch (error) {
        console.error("Failed to load surface materials:", error);
        return false;
      }
    },

    exportToJson: (): string => {
      const exportData = {
        size,
        terrainSize,
        data: Array.from(data),
      };
      return JSON.stringify(exportData, null, 2);
    },

    importFromJson: (jsonData: string): boolean => {
      try {
        const importData = JSON.parse(jsonData) as {
          size: number;
          terrainSize: number;
          data: number[];
        };

        // Validate imported data
        if (
          importData.size !== size ||
          importData.terrainSize !== terrainSize ||
          !Array.isArray(importData.data)
        ) {
          console.error("Invalid surface material data format");
          return false;
        }

        // Restore data array
        for (let i = 0; i < size * size * 4; i++) {
          data[i] = importData.data[i] ?? 0;
        }

        texture.needsUpdate = true;
        return true;
      } catch (error) {
        console.error("Failed to import surface materials:", error);
        return false;
      }
    },
  };
};
