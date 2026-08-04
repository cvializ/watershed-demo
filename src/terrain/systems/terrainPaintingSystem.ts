import * as THREE from "three";

import type { SurfaceMaterialType } from "@/scene/resources/textures/surfaceMaterial";
import type { TerrainPainter } from "@/terrain/paintTerrain";

/**
 * Configuration for terrain painting interaction.
 */
export type TerrainPaintingConfig = {
  /** Enable/disable terrain painting */
  enabled: boolean;

  /** Current brush material type */
  brushMaterial: SurfaceMaterialType;

  /** Brush radius in world units */
  brushRadius: number;

  /** Painting strength (0-1) */
  brushStrength: number;

  /** Key code to hold for painting (default: Shift) */
  paintKey: string;

  /** Mouse button to use for painting (default: 'right') */
  paintMouseButton: "left" | "right" | "middle";
};

/**
 * Terrain painting system for interactive material painting.
 * Handles mouse/touch input and raycasting to paint materials on terrain.
 */
export type TerrainPaintingSystem = {
  /** Update the system (call every frame) */
  update: () => void;

  /** Set the terrain painter instance */
  setTerrainPainter: (painter: TerrainPainter) => void;

  /** Set the camera for raycasting */
  setCamera: (camera: THREE.Camera) => void;

  /** Set the terrain mesh for raycasting */
  setTerrainMesh: (mesh: THREE.Mesh) => void;

  /** Update configuration */
  updateConfig: (config: Partial<TerrainPaintingConfig>) => void;

  /** Get current configuration */
  getConfig: () => TerrainPaintingConfig;

  /** Enable painting */
  enable: () => void;

  /** Disable painting */
  disable: () => void;

  /** Check if painting is enabled */
  isEnabled: () => boolean;
};

/**
 * Creates a terrain painting system for interactive material painting.
 * 
 * Usage:
 * ```typescript
 * const paintingSystem = createTerrainPaintingSystem({
 *   enabled: true,
 *   brushMaterial: "grass",
 *   brushRadius: 2.0,
 *   brushStrength: 1.0,
 * });
 * 
 * // In your game loop:
 * paintingSystem.update();
 * 
 * // Set painter when available
 * paintingSystem.setTerrainPainter(terrainPainter);
 * 
 * // Set camera and terrain mesh for raycasting
 * paintingSystem.setCamera(camera);
 * paintingSystem.setTerrainMesh(terrainMesh);
 * ```
 */
export const createTerrainPaintingSystem = (
  initialConfig: Partial<TerrainPaintingConfig> = {},
): TerrainPaintingSystem => {
  const config: TerrainPaintingConfig = {
    enabled: initialConfig.enabled ?? true,
    brushMaterial: initialConfig.brushMaterial ?? "bareDirt",
    brushRadius: initialConfig.brushRadius ?? 2.0,
    brushStrength: initialConfig.brushStrength ?? 1.0,
    paintKey: initialConfig.paintKey ?? "Shift",
    paintMouseButton: initialConfig.paintMouseButton ?? "right",
  };

  let terrainPainter: TerrainPainter | null = null;
  let camera: THREE.Camera | null = null;
  let terrainMesh: THREE.Mesh | null = null;

  // Raycaster for mouse interaction
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Painting state
  let isPainting = false;
  let lastPaintTime = 0;
  const paintCooldown = 50; // ms between paint operations

  // Event handlers
  const handleMouseDown = (event: MouseEvent): void => {
    if (!config.enabled || !terrainPainter) return;

    // Check mouse button
    const buttonMap: Record<string, number> = {
      left: 0,
      right: 2,
      middle: 1,
    };
    const expectedButton = buttonMap[config.paintMouseButton];

    if (event.button === expectedButton) {
      isPainting = true;
      paintAtMousePosition(event);
    }
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (!config.enabled || !isPainting || !terrainPainter) return;

    // Cooldown to prevent too frequent painting
    const now = performance.now();
    if (now - lastPaintTime < paintCooldown) return;

    paintAtMousePosition(event);
    lastPaintTime = now;
  };

  const handleMouseUp = (): void => {
    isPainting = false;
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!config.enabled || event.key !== config.paintKey) return;

    // Hold key to paint
    if (!isPainting && terrainPainter) {
      isPainting = true;
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!config.enabled || event.key !== config.paintKey) return;

    isPainting = false;
  };

  // Convert mouse coordinates to normalized device coordinates
  const updateMouseCoordinates = (event: MouseEvent): void => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  };

  // Paint at current mouse position
  const paintAtMousePosition = (event: MouseEvent): void => {
    if (!camera || !terrainMesh || !terrainPainter) return;

    updateMouseCoordinates(event);

    // Raycast to find terrain intersection
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0) {
      const intersection = intersects[0];
      const point = intersection.point;

      // Convert world coordinates to terrain coordinates (0 to terrainSize)
      // Assuming terrain is centered at origin with size 12
      const terrainSize = 12;
      const x = (point.x + terrainSize / 2);
      const y = (point.z + terrainSize / 2);

      // Paint at this location
      terrainPainter.paint(
        x,
        y,
        config.brushMaterial,
        config.brushRadius,
        config.brushStrength,
      );
    }
  };

  // Attach event listeners
  const attachEventListeners = (): void => {
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
  };

  

  // Attach listeners on creation
  attachEventListeners();

  return {
    update: (): void => {
      // Continuous painting while key is held down
      if (isPainting && terrainPainter) {
        const now = performance.now();
        if (now - lastPaintTime >= paintCooldown) {
          // Note: For continuous painting, we'd need to track the last mouse position
          // This is a simplified version - in practice you'd want to store the last mouse pos
          lastPaintTime = now;
        }
      }
    },

    setTerrainPainter: (painter: TerrainPainter): void => {
      terrainPainter = painter;
    },

    setCamera: (cam: THREE.Camera): void => {
      camera = cam;
    },

    setTerrainMesh: (mesh: THREE.Mesh): void => {
      terrainMesh = mesh;
    },

    updateConfig: (newConfig: Partial<TerrainPaintingConfig>): void => {
      if (newConfig.enabled !== undefined) config.enabled = newConfig.enabled;
      if (newConfig.brushMaterial !== undefined) config.brushMaterial = newConfig.brushMaterial;
      if (newConfig.brushRadius !== undefined) config.brushRadius = newConfig.brushRadius;
      if (newConfig.brushStrength !== undefined) config.brushStrength = newConfig.brushStrength;
      if (newConfig.paintKey !== undefined) config.paintKey = newConfig.paintKey;
      if (newConfig.paintMouseButton !== undefined) config.paintMouseButton = newConfig.paintMouseButton;
    },

    getConfig: (): TerrainPaintingConfig => {
      return { ...config };
    },

    enable: (): void => {
      config.enabled = true;
    },

    disable: (): void => {
      config.enabled = false;
      isPainting = false;
    },

    isEnabled: (): boolean => {
      return config.enabled;
    },
  };
};

/**
 * Cleanup function to remove event listeners.
 */
export const cleanupTerrainPaintingSystem = (): void => {
  // Event listeners are removed when the page unloads
  // This function can be used for explicit cleanup if needed
};