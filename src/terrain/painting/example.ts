/**
 * Example: How to use the terrain painting system
 * 
 * This file demonstrates how to set up and use the terrain painting system
 * to paint different surface materials on your terrain.
 */

import * as THREE from "three";

import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";
import { createTerrainPaintingSystem } from "@/terrain/systems/terrainPaintingSystem";
import { createSurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";

/**
 * Example 1: Basic Setup
 */
export const exampleBasicSetup = (_renderer: THREE.WebGLRenderer) => {
  // Step 1: Create surface material texture
  const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);

  // Step 2: Get the texture for GPU simulation
  const surfaceMaterialMap = surfaceMaterialTexture.getTexture();

  // Step 3: Pass to water simulation (pseudo-code)
  // const waterSimulation = createGpuWaterFlowSimulation(
  //   512,
  //   12,
  //   renderer,
  //   heightMapTexture,
  //   surfaceMaterialMap, // Pass the surface material map
  // );

  // Step 4: Create terrain painter for programmatic painting
  const terrainPainter = createTerrainPainterFromSurfaceMaterial(
    surfaceMaterialTexture,
  );

  // Step 5: Paint materials programmatically
  terrainPainter.paint(6, 6, "grass", 2.0); // Paint grass at center
  terrainPainter.paint(8, 4, "rocks", 1.5); // Paint rocks at (8, 4)

  return { terrainPainter, surfaceMaterialMap };
};

/**
 * Example 2: Interactive Mouse Painting
 */
export const exampleInteractivePainting = (
  _camera: THREE.Camera,
  _terrainMesh: THREE.Mesh,
) => {
  // Step 1: Create surface material texture and painter
  const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);
  const terrainPainter = createTerrainPainterFromSurfaceMaterial(
    surfaceMaterialTexture,
  );

  // Step 2: Create painting system for mouse interaction
  const paintingSystem = createTerrainPaintingSystem({
    enabled: true,
    brushMaterial: "grass", // Default brush material
    brushRadius: 2.0, // Brush size in world units
    brushStrength: 1.0, // Full strength painting
  });

  // Step 3: Set up the painting system
  paintingSystem.setTerrainPainter(terrainPainter);
  paintingSystem.setCamera(_camera);
  paintingSystem.setTerrainMesh(_terrainMesh);

  // Step 4: In your game loop, call update
  const _updateGameLoop = () => {
    paintingSystem.update();
  };

  return { paintingSystem, terrainPainter, _updateGameLoop };
};

/**
 * Example 3: Changing Brush Materials on the Fly
 */
export const exampleChangingMaterials = () => {
  // Create surface material texture and painter
  const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);
  const terrainPainter = createTerrainPainterFromSurfaceMaterial(
    surfaceMaterialTexture,
  );

  // Create painting system
  const paintingSystem = createTerrainPaintingSystem({
    enabled: true,
    brushMaterial: "bareDirt", // Start with bare dirt
    brushRadius: 2.0,
    brushStrength: 1.0,
  });

  paintingSystem.setTerrainPainter(terrainPainter);

  // Change brush material based on user input
  const handleKeyPress = (key: string) => {
    switch (key) {
      case "1":
        paintingSystem.updateConfig({ brushMaterial: "bareDirt" });
        console.log("Brush set to: Bare Dirt");
        break;
      case "2":
        paintingSystem.updateConfig({ brushMaterial: "grass" });
        console.log("Brush set to: Grass");
        break;
      case "3":
        paintingSystem.updateConfig({ brushMaterial: "rocks" });
        console.log("Brush set to: Rocks");
        break;
    }
  };

  // Listen for key presses
  window.addEventListener("keydown", (e) => {
    if (["1", "2", "3"].includes(e.key)) {
      handleKeyPress(e.key);
    }
  });

  return { paintingSystem, terrainPainter };
};

/**
 * Example 4: Creating Material Patterns
 */
export const exampleMaterialPatterns = (terrainPainter: ReturnType<typeof createTerrainPainterFromSurfaceMaterial>) => {
  // Create a river bed pattern with rocks in the center and grass on banks
  const createRiverPattern = () => {
    for (let x = 2; x < 10; x += 0.5) {
      // Paint rocks in a narrow strip along the center (river bed)
      terrainPainter.paint(x, 6, "rocks", 0.5);

      // Add grass on the banks
      terrainPainter.paint(x, 4.5, "grass", 0.8);
      terrainPainter.paint(x, 7.5, "grass", 0.8);
    }
  };

  // Create a pond area with grass that absorbs water
  const createPondPattern = () => {
    const centerX = 6;
    const centerZ = 6;
    const radius = 3.0;

    // Paint grass in a circular area (pond)
    terrainPainter.paint(centerX, centerZ, "grass", radius);

    // Add rocks around the edge for faster drainage
    terrainPainter.paint(centerX, centerZ, "rocks", radius + 0.5, 0.3);
  };

  // Create steep slope with rocks for faster runoff
  const createSteepSlopePattern = () => {
    // This is pseudo-code - you'd need to check actual slope values
    for (let y = 0; y < 12; y += 0.5) {
      for (let x = 0; x < 12; x += 0.5) {
        // const slope = getSlopeAt(x, y); // Your slope calculation

        // For demo purposes, assume certain areas are steep
        const isSteep = (x > 8 && y < 4) || (x < 4 && y > 8);

        if (isSteep) {
          // Steep area - paint rocks for faster flow
          terrainPainter.paint(x, y, "rocks", 0.3);
        } else {
          // Gentle slope - use bare dirt
          terrainPainter.paint(x, y, "bareDirt", 0.3);
        }
      }
    }
  };

  return { createRiverPattern, createPondPattern, createSteepSlopePattern };
};

/**
 * Example 5: Adjusting Brush Properties
 */
export const exampleBrushProperties = (painter: ReturnType<typeof createTerrainPainterFromSurfaceMaterial>) => {
  // Adjust brush radius dynamically
  const adjustBrushSize = (size: "small" | "medium" | "large") => {
    const sizes = { small: 1.0, medium: 2.0, large: 4.0 };
    painter.setBrushRadius(sizes[size]);
  };

  // Adjust painting strength for subtle effects
  const adjustBrushStrength = (strength: number) => {
    painter.setBrushStrength(Math.max(0, Math.min(1, strength)));
  };

  // Example: Paint with varying strength for blending
  const blendMaterials = () => {
    // Paint grass with full strength
    painter.paint(6, 6, "grass", 2.0, 1.0);

    // Blend in rocks with lower strength
    painter.paint(6, 6, "rocks", 2.0, 0.3);

    // Add bare dirt with very low strength for subtle transition
    painter.paint(6, 6, "bareDirt", 2.0, 0.1);
  };

  return { adjustBrushSize, adjustBrushStrength, blendMaterials };
};

/**
 * Example 6: Complete Integration (Full Setup)
 */
export const exampleCompleteIntegration = (
  _renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  terrainMesh: THREE.Mesh,
) => {
  // Create surface material texture
  const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);

  // Create terrain painter
  const terrainPainter = createTerrainPainterFromSurfaceMaterial(
    surfaceMaterialTexture,
  );

  // Create interactive painting system
  const paintingSystem = createTerrainPaintingSystem({
    enabled: true,
    brushMaterial: "bareDirt",
    brushRadius: 2.0,
    brushStrength: 1.0,
  });

  // Set up painting system
  paintingSystem.setTerrainPainter(terrainPainter);
  paintingSystem.setCamera(camera);
  paintingSystem.setTerrainMesh(terrainMesh);

  // Add keyboard shortcuts for material switching
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "1":
        paintingSystem.updateConfig({ brushMaterial: "bareDirt" });
        break;
      case "2":
        paintingSystem.updateConfig({ brushMaterial: "grass" });
        break;
      case "3":
        paintingSystem.updateConfig({ brushMaterial: "rocks" });
        break;
      case "+":
      case "=":
        // Increase brush size
        const currentRadius = paintingSystem.getConfig().brushRadius;
        paintingSystem.updateConfig({ brushRadius: Math.min(6, currentRadius + 0.5) });
        break;
      case "-":
      case "_":
        // Decrease brush size
        const currentRadius2 = paintingSystem.getConfig().brushRadius;
        paintingSystem.updateConfig({ brushRadius: Math.max(0.5, currentRadius2 - 0.5) });
        break;
    }
  });

  // Game loop
  const _updateGameLoop = () => {
    // Update painting system
    paintingSystem.update();

    // ... rest of your game loop (update simulation, render, etc.)
  };

  return {
    terrainPainter,
    paintingSystem,
    surfaceMaterialMap: surfaceMaterialTexture.getTexture(),
    _updateGameLoop,
  };
};

/**
 * Usage Instructions:
 * 
 * 1. Right-click and drag to paint with the current material
 * 2. Press '1' for bare dirt, '2' for grass, '3' for rocks
 * 3. Press '+' or '-' to adjust brush size
 * 
 * Materials affect water flow:
 * - Bare Dirt: Normal flow, moderate absorption
 * - Grass: Slower flow, high absorption (water soaks in)
 * - Rocks: Faster flow, low absorption (water runs off)
 */