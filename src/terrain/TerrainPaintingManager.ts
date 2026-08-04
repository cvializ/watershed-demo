import * as THREE from "three";

import type { SurfaceMaterialType } from "@/scene/resources/textures/surfaceMaterial";
import type { TerrainPainter } from "@/terrain/paintTerrain";
import { createTerrainPaintingSystem, type TerrainPaintingSystem } from "@/terrain/systems/terrainPaintingSystem";

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
};

/**
 * Global terrain painting manager instance.
 * This is a singleton that coordinates between React UI and the painting system.
 */
let _terrainPaintingManager: TerrainPaintingManager | null = null;
let terrainPainterInstance: TerrainPainter | null = null;
let paintingSystemInstance: TerrainPaintingSystem | null = null;

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
  };

  return _terrainPaintingManager;
};

/**
 * Get the global terrain painter instance (convenience method).
 */
export const getTerrainPainter = (): TerrainPainter | null => {
  return terrainPainterInstance;
};

/**
 * Get the global painting system instance (convenience method).
 */
export const getPaintingSystem = (): TerrainPaintingSystem | null => {
  return paintingSystemInstance;
};

/**
 * Convenience function to paint at a location (can be called from anywhere).
 */
export const paintTerrain = (
  x: number,
  y: number,
  materialType: SurfaceMaterialType,
  radius: number,
  strength?: number,
) => {
  if (terrainPainterInstance) {
    terrainPainterInstance.paint(x, y, materialType, radius, strength);
  }
};

/**
 * Clear all terrain materials (convenience function).
 */
export const clearTerrainMaterials = () => {
  if (terrainPainterInstance) {
    terrainPainterInstance.clear();
  }
};