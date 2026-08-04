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
  let lastMousePosition: { x: number; y: number } | null = null;

  // Clear materials event handler
  const handleClearMaterials = () => {
    if (terrainPainter) {
      terrainPainter.clear();
    }
  };

  window.addEventListener("terrain-paint-clear", handleClearMaterials);

  // Event handlers
  const handleMouseDown = (event: MouseEvent): void => {
    if (!config.enabled || !terrainPainter) return;

    // Right-click to start painting
    if (event.button === 2) {
      console.log("[painting] Right-click detected, starting paint");
      event.preventDefault();
      event.stopPropagation();
      isPainting = true;
      lastMousePosition = { x: event.clientX, y: event.clientY };
      paintAtMousePosition(event);
    }
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (!config.enabled || !isPainting || !terrainPainter) return;

    // Store last mouse position for continuous painting
    lastMousePosition = { x: event.clientX, y: event.clientY };

    // Cooldown to prevent too frequent painting
    const now = performance.now();
    if (now - lastPaintTime < paintCooldown) return;

    console.log("[painting] Painting at", event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
    paintAtMousePosition(event);
    lastPaintTime = now;
  };

  const handleMouseUp = (): void => {
    isPainting = false;
    lastMousePosition = null;
  };

  const handleContextMenu = (event: MouseEvent): void => {
    // Always prevent context menu on right-click
    event.preventDefault();
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    // Shift key to enable painting mode
    if (!config.enabled || event.key !== "Shift") return;

    // Hold Shift to paint
    if (!isPainting && terrainPainter) {
      isPainting = true;
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!config.enabled || event.key !== "Shift") return;

    isPainting = false;
  };

  // Convert mouse coordinates to normalized device coordinates
  const updateMouseCoordinates = (event: MouseEvent): void => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  };

  // Paint at current mouse position
  const paintAtMousePosition = (event: MouseEvent): void => {
    if (!camera || !terrainMesh || !terrainPainter) {
      console.log("[painting] Missing dependencies:", { camera: !!camera, terrainMesh: !!terrainMesh, terrainPainter: !!terrainPainter });
      return;
    }

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
      const x = point.x + terrainSize / 2;
      const y = point.z + terrainSize / 2;

      console.log("[painting] Painting at world point", point, "-> terrain coords", x, y);

      // Paint at this location
      terrainPainter.paint(
        x,
        y,
        config.brushMaterial,
        config.brushRadius,
        config.brushStrength,
      );
    } else {
      console.log("[painting] No terrain intersection found");
    }
  };

  // Attach event listeners
  const attachEventListeners = (): void => {
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("contextmenu", handleContextMenu);
  };

  

  // Attach listeners on creation
  attachEventListeners();

  return {
    update: (): void => {
      // Continuous painting while Shift is held down
      if (isPainting && terrainPainter && lastMousePosition) {
        const now = performance.now();
        if (now - lastPaintTime >= paintCooldown) {
          // Create a synthetic mouse event for continuous painting
          const syntheticEvent = new MouseEvent("mousemove", {
            clientX: lastMousePosition.x,
            clientY: lastMousePosition.y,
          });
          paintAtMousePosition(syntheticEvent);
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