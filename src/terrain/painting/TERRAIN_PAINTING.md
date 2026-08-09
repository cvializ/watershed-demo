# Terrain Painting System

This document describes how to use the terrain painting system to paint different surface materials on your terrain, which affect water flow behavior.

## Overview

The terrain painting system allows you to paint different surface materials on the terrain mesh. Each material type has unique properties that affect how water flows:

- **Bare Dirt**: Moderate absorption, normal flow speed
- **Grass**: High absorption (soaks up water), higher friction (slows water down)
- **Rocks**: Low absorption (water runs off), lower friction (faster flow on smooth surfaces)

## Quick Start

### 1. Create Surface Material Texture

```typescript
import { createSurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";

const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12); // size, terrainSize

// Get the texture for GPU simulation
const surfaceMaterialMap = surfaceMaterialTexture.getTexture();

// Pass to water simulation
const waterSimulation = createGpuWaterFlowSimulation(
  512,
  12,
  renderer,
  heightMapTexture,
  surfaceMaterialMap, // Pass the surface material map
);
```

### 2. Create Terrain Painter

```typescript
import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";

const terrainPainter = createTerrainPainterFromSurfaceMaterial(
  surfaceMaterialTexture,
);
```

### 3. Paint Materials Programmatically

```typescript
// Paint grass at position (6, 6) with radius 2.0
terrainPainter.paint(6, 6, "grass", 2.0);

// Paint rocks with reduced strength (50%)
terrainPainter.paint(8, 4, "rocks", 1.5, 0.5);

// Clear all materials (reset to bare dirt)
terrainPainter.clear();
```

### 4. Interactive Painting with Mouse

```typescript
import { createTerrainPaintingSystem } from "@/terrain/systems/terrainPaintingSystem";

// Create painting system
const paintingSystem = createTerrainPaintingSystem({
  enabled: true,
  brushMaterial: "grass",
  brushRadius: 2.0,
  brushStrength: 1.0,
  paintMouseButton: "right", // Use right mouse button
});

// Set up painter, camera, and terrain mesh
paintingSystem.setTerrainPainter(terrainPainter);
paintingSystem.setCamera(camera);
paintingSystem.setTerrainMesh(terrainMesh);

// Call update in your game loop
function gameLoop(deltaTime: number) {
  paintingSystem.update();
  // ... rest of your game loop
}
```

## Configuration Options

### Terrain Painting System Config

```typescript
type TerrainPaintingConfig = {
  enabled: boolean; // Enable/disable painting
  brushMaterial: "bareDirt" | "grass" | "rocks"; // Current brush material
  brushRadius: number; // Brush radius in world units (default: 2.0)
  brushStrength: number; // Painting strength 0-1 (default: 1.0)
  paintKey: string; // Key to hold for painting (default: "Shift")
  paintMouseButton: "left" | "right" | "middle"; // Mouse button (default: "right")
};
```

### Update Configuration

```typescript
// Change brush material to rocks
paintingSystem.updateConfig({ brushMaterial: "rocks" });

// Increase brush radius
paintingSystem.updateConfig({ brushRadius: 3.0 });

// Reduce painting strength
paintingSystem.updateConfig({ brushStrength: 0.5 });

// Disable painting temporarily
paintingSystem.disable();

// Re-enable painting
paintingSystem.enable();
```

## Material Properties

Each material type has specific properties that affect water flow:

| Material  | Infiltration Rate | Friction Coefficient | Visual Color    |
| --------- | ----------------- | -------------------- | --------------- |
| Bare Dirt | 0.5 (moderate)    | 1.0 (normal)         | Brown (#664C33) |
| Grass     | 0.8 (high)        | 1.3 (slower flow)    | Green (#339933) |
| Rocks     | 0.2 (low)         | 0.8 (faster flow)    | Gray (#808099)  |

### How Materials Affect Water Flow

1. **Infiltration Rate**: Controls how quickly water soaks into the ground
   - Higher values = more absorption = less surface water
   - Grass has high infiltration (0.8), so water disappears faster
   - Rocks have low infiltration (0.2), so water stays on surface longer

2. **Friction Coefficient**: Controls how much the material slows water velocity
   - Higher values = slower water flow
   - Grass creates more friction (1.3), slowing water down
   - Rocks are smooth (0.8), allowing faster flow

## Example: Creating Material Patterns

### River Bed Pattern

```typescript
// Create a river bed with rocks along the center
for (let x = 2; x < 10; x++) {
  // Paint rocks in a narrow strip along the center
  terrainPainter.paint(x, 6, "rocks", 0.5);
}

// Add grass on the banks
for (let x = 2; x < 10; x++) {
  terrainPainter.paint(x, 4.5, "grass", 0.8);
  terrainPainter.paint(x, 7.5, "grass", 0.8);
}

// Fill rest with bare dirt (default)
```

### Pond Area with Grass

```typescript
// Create a grassy pond area that absorbs water
const centerX = 6;
const centerZ = 6;
const radius = 3.0;

// Paint grass in a circular area
terrainPainter.paint(centerX, centerZ, "grass", radius);

// Add rocks around the edge for faster drainage
terrainPainter.paint(centerX, centerZ, "rocks", radius + 0.5, 0.3);
```

### Steep Slope with Rocks

```typescript
// Paint rocks on steep areas for faster runoff
for (let y = 0; y < 12; y += 0.5) {
  for (let x = 0; x < 12; x += 0.5) {
    // Check slope at this position (pseudo-code)
    const slope = getSlopeAt(x, y);

    if (slope > 0.5) {
      // Steep area - paint rocks for faster flow
      terrainPainter.paint(x, y, "rocks", 0.3);
    } else {
      // Gentle slope - use bare dirt
      terrainPainter.paint(x, y, "bareDirt", 0.3);
    }
  }
}
```

## Integration with Water Simulation

The surface material texture is automatically integrated into the water flow simulation:

1. **Water Height Shader** (`water-height.frag`): Samples the surface material map to determine infiltration rate
2. **Water Velocity Shader** (`water-velocity.frag`): Samples the surface material map to apply friction
3. **Terrain Visualization** (`water-visualization.frag`): Displays different colors for each material type

No additional setup is required - just pass the surface material texture to the water simulation.

## Debugging Tips

### Visualize Material Distribution

The terrain visualization will show different colors for each material:

- **Brown**: Bare dirt areas
- **Green**: Grass areas
- **Gray**: Rock areas

### Check Texture Updates

```typescript
// Log material texture info
const texture = surfaceMaterialTexture.getTexture();
console.log("Surface material texture:", {
  size: texture.image.width,
  type: texture.type,
  format: texture.format,
});
```

### Test Material Properties

```typescript
// Get material properties
const grassProps = surfaceMaterialTexture.getMaterialProperties("grass");
console.log("Grass properties:", grassProps);
// { infiltrationRate: 0.8, frictionCoefficient: 1.3, color: [0.2, 0.6, 0.2] }
```

## Performance Considerations

- **Painting Frequency**: The painting system has a 50ms cooldown to prevent excessive texture updates
- **Texture Size**: Use appropriate texture resolution (512x512 recommended for 512x512 simulation)
- **Brush Radius**: Larger radii require more pixel calculations but can be painted less frequently

## Troubleshooting

### Water Not Affected by Materials

1. Ensure the surface material texture is passed to `createGpuWaterFlowSimulation`
2. Check that the texture is set in the water height uniform: `uniforms.surfaceMaterialMap.value = surfaceMaterialMap`
3. Verify the shader files include surface material sampling

### Materials Not Visible

1. Check that `uSurfaceMaterialMap` is set in the water visualization material
2. Ensure the terrain mesh uses the water visualization material
3. Verify the surface material texture has been updated (`texture.needsUpdate = true`)

### Painting Not Working

1. Check that `paintingSystem.setTerrainPainter()` has been called
2. Verify camera and terrain mesh are set: `setCamera()` and `setTerrainMesh()`
3. Ensure the correct mouse button is being used (default: right click)

## API Reference

### Surface Material Texture

```typescript
type SurfaceMaterialTexture = {
  paint: (x, y, materialType, radius, strength?) => void;
  clear: () => void;
  getTexture: () => Texture;
  getMaterialProperties: (materialType) => MaterialProperties;
};
```

### Terrain Painter

```typescript
type TerrainPainter = {
  paint: (x, y, materialType, radius, strength?) => void;
  clear: () => void;
  setBrushMaterial: (materialType) => void;
  setBrushRadius: (radius) => void;
  setBrushStrength: (strength) => void;
  getBrushMaterial: () => SurfaceMaterialType;
  getBrushRadius: () => number;
  getBrushStrength: () => number;
};
```

### Terrain Painting System

```typescript
type TerrainPaintingSystem = {
  update: () => void;
  setTerrainPainter: (painter) => void;
  setCamera: (camera) => void;
  setTerrainMesh: (mesh) => void;
  updateConfig: (config) => void;
  getConfig: () => TerrainPaintingConfig;
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
};
```

## Next Steps

- Add more material types (sand, snow, concrete, etc.)
- Implement material blending for smoother transitions
- Add keyboard shortcuts to quickly switch between materials
- Create preset material patterns (river beds, ponds, etc.)
