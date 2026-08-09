# Terrain Painting System

This project now includes a complete terrain painting system that allows you to paint different surface materials on the terrain mesh. These materials affect how water flows across the terrain, making the simulation more realistic and controllable.

## Features

- **Three Material Types**: Bare dirt, grass, and rocks
- **Material Properties**: Each material has unique infiltration rates and friction coefficients
- **Programmatic Painting**: Paint materials via code for precise control
- **Interactive Mouse Painting**: Right-click and drag to paint in real-time
- **Keyboard Shortcuts**: Switch between materials with number keys (1, 2, 3)
- **Adjustable Brush**: Change brush size and strength on the fly

## Quick Start

### 1. Basic Setup

The surface material texture is already integrated into the water simulation. To use it:

```typescript
// Surface material texture is created in src/renderer/resources/simulation.ts
import { getTexture, TextureEnum } from "@/scene/resources/texture";

// Get the surface material texture
const surfaceMaterialMap = getTexture(TextureEnum.SurfaceMaterialMap);

// It's already passed to the water simulation and visualization material
```

### 2. Paint Materials Programmatically

```typescript
import { createTerrainPainterFromSurfaceMaterial } from "@/terrain/paintTerrain";
import { getTexture, TextureEnum } from "@/scene/resources/texture";

// Create surface material texture manager
import { createSurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";
const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);

// Create terrain painter
const terrainPainter = createTerrainPainterFromSurfaceMaterial(
  surfaceMaterialTexture,
);

// Paint materials
terrainPainter.paint(6, 6, "grass", 2.0); // Paint grass at center
terrainPainter.paint(8, 4, "rocks", 1.5); // Paint rocks at (8, 4)
terrainPainter.paint(2, 8, "bareDirt", 1.0); // Paint bare dirt
```

### 3. Interactive Mouse Painting

The interactive painting system is ready to use:

```typescript
import { createTerrainPaintingSystem } from "@/terrain/systems/terrainPaintingSystem";

// Create painting system
const paintingSystem = createTerrainPaintingSystem({
  enabled: true,
  brushMaterial: "grass",
  brushRadius: 2.0,
  brushStrength: 1.0,
});

// Set up painter (when available)
paintingSystem.setTerrainPainter(terrainPainter);

// Set camera and terrain mesh for raycasting
paintingSystem.setCamera(camera);
paintingSystem.setTerrainMesh(terrainMesh);

// Call update in your game loop
function gameLoop(deltaTime: number) {
  paintingSystem.update();
}
```

## How to Use

### Keyboard Controls

- **Right-click + Drag**: Paint with current material
- **1**: Switch to bare dirt
- **2**: Switch to grass
- **3**: Switch to rocks
- **+ / =**: Increase brush size
- **- / _**: Decrease brush size

### Material Properties

| Material      | Infiltration Rate | Friction Coefficient | Visual Color    |
| ------------- | ----------------- | -------------------- | --------------- |
| **Bare Dirt** | 0.5 (moderate)    | 1.0 (normal)         | Brown (#664C33) |
| **Grass**     | 0.8 (high)        | 1.3 (slower flow)    | Green (#339933) |
| **Rocks**     | 0.2 (low)         | 0.8 (faster flow)    | Gray (#808099)  |

### How Materials Affect Water Flow

1. **Infiltration Rate**: Controls how quickly water soaks into the ground
   - Higher values = more absorption = less surface water
   - Grass (0.8) absorbs water quickly, reducing surface flow
   - Rocks (0.2) have low absorption, keeping water on the surface

2. **Friction Coefficient**: Controls how much the material slows water velocity
   - Higher values = slower water flow
   - Grass (1.3) creates more friction, slowing water down
   - Rocks (0.8) are smooth, allowing faster flow

## Example Patterns

### River Bed Pattern

Create a river bed with rocks along the center and grass on banks:

```typescript
for (let x = 2; x < 10; x += 0.5) {
  // Paint rocks in a narrow strip (river bed)
  terrainPainter.paint(x, 6, "rocks", 0.5);

  // Add grass on the banks
  terrainPainter.paint(x, 4.5, "grass", 0.8);
  terrainPainter.paint(x, 7.5, "grass", 0.8);
}
```

### Pond Area with Grass

Create a grassy pond area that absorbs water:

```typescript
const centerX = 6;
const centerZ = 6;
const radius = 3.0;

// Paint grass in a circular area (pond)
terrainPainter.paint(centerX, centerZ, "grass", radius);

// Add rocks around the edge for faster drainage
terrainPainter.paint(centerX, centerZ, "rocks", radius + 0.5, 0.3);
```

## File Structure

- `src/scene/resources/textures/surfaceMaterial.ts` - Surface material texture manager
- `src/terrain/paintTerrain.ts` - Terrain painter API
- `src/terrain/systems/terrainPaintingSystem.ts` - Interactive mouse painting system
- `src/terrain/painting/example.ts` - Usage examples
- `src/terrain/painting/TERRAIN_PAINTING.md` - Detailed documentation

## Integration Points

The surface material system is integrated at these points:

1. **Water Height Shader** (`src/shaders/compute/water-height.frag`)
   - Samples surface material map for infiltration rate

2. **Water Velocity Shader** (`src/shaders/compute/water-velocity.frag`)
   - Samples surface material map for friction coefficient

3. **Terrain Visualization** (`src/shaders/water-visualization.frag`)
   - Displays different colors for each material type

4. **Simulation Resource** (`src/renderer/resources/simulation.ts`)
   - Creates and manages surface material texture

## Testing the System

### Visual Verification

When you run the application, you should see:

- **Brown areas**: Bare dirt (default)
- **Green areas**: Grass (where you've painted grass)
- **Gray areas**: Rocks (where you've painted rocks)

### Water Flow Verification

After painting materials:

1. Add water to the terrain (using existing water addition controls)
2. Observe how water behaves differently on different materials:
   - On **grass**: Water should absorb quickly and flow slowly
   - On **rocks**: Water should stay on surface longer and flow faster
   - On **bare dirt**: Normal water behavior

## Advanced Usage

### Custom Material Properties

You can modify material properties in `src/scene/resources/textures/surfaceMaterial.ts`:

```typescript
export const MATERIAL_PROPERTIES: Record<
  SurfaceMaterialType,
  MaterialProperties
> = {
  bareDirt: {
    infiltrationRate: 0.5, // Adjust absorption rate
    frictionCoefficient: 1.0, // Adjust flow speed
    color: [0.4, 0.3, 0.2], // Adjust visual color
  },
  // ... other materials
};
```

### Adding New Material Types

1. Add new type to `SurfaceMaterialType` union
2. Define properties in `MATERIAL_PROPERTIES`
3. Add material ID to `MATERIAL_TYPE_IDS`
4. Update shader constants if needed

## Troubleshooting

### Water Not Affected by Materials

1. Ensure the surface material texture is passed to `createGpuWaterFlowSimulation`
2. Check that the texture is set in the water height uniform
3. Verify the shader files include surface material sampling

### Materials Not Visible

1. Check that `uSurfaceMaterialMap` is set in the water visualization material
2. Ensure the terrain mesh uses the water visualization material
3. Verify the surface material texture has been updated

### Painting Not Working

1. Check that `paintingSystem.setTerrainPainter()` has been called
2. Verify camera and terrain mesh are set with `setCamera()` and `setTerrainMesh()`
3. Ensure you're using the correct mouse button (default: right click)

## Next Steps

Potential enhancements:

- Add more material types (sand, snow, concrete, etc.)
- Implement material blending for smoother transitions
- Add keyboard shortcuts to quickly switch between materials
- Create preset material patterns (river beds, ponds, etc.)
- Add a UI panel for brush controls and material selection

## References

- [Detailed Documentation](src/terrain/painting/TERRAIN_PAINTING.md)
- [Usage Examples](src/terrain/painting/example.ts)
