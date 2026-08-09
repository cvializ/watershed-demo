# Terrain Painting Implementation Summary

## Overview

This document summarizes the implementation of the terrain painting system that allows you to paint different surface materials on the terrain mesh, affecting water flow behavior based on material type rather than height.

## What Was Implemented

### 1. Surface Material Texture System

**File**: `src/scene/resources/textures/surfaceMaterial.ts`

- Created `SurfaceMaterialTexture` type for managing surface material textures
- Defined three material types: `bareDirt`, `grass`, and `rocks`
- Each material has unique properties:
  - **Infiltration rate**: How quickly water soaks into the ground
  - **Friction coefficient**: How much the material slows water flow
  - **Visual color**: For terrain visualization

**Key Features**:

- Paint function to apply materials at specific locations with brush radius and strength
- Clear function to reset all materials to bare dirt
- Texture format: RGBA Float32 with material type ID in R channel

### 2. Terrain Painter API

**File**: `src/terrain/paintTerrain.ts`

- Created `TerrainPainter` type with a clean API for painting materials
- Provides brush control (material, radius, strength)
- Factory function `createTerrainPainterFromSurfaceMaterial` to wrap surface material texture

### 3. Interactive Painting System

**File**: `src/terrain/systems/terrainPaintingSystem.ts`

- Created `TerrainPaintingSystem` for mouse-based painting
- Raycasting to detect terrain intersections
- Event handlers for mouse/touch input
- Configurable brush properties and painting behavior
- Cooldown mechanism to prevent excessive texture updates

### 4. Integration with Water Simulation

**Updated Files**:

- `src/gpu/waterFlowSimulation/createGpuWaterFlowSimulation.ts`
- `src/gpu/waterFlowSimulation/variables/createGpuWaterHeight.ts`

**Changes**:

- Added `surfaceMaterialMap` parameter to water flow simulation
- Updated water height variable to accept and use surface material texture
- Surface material is now sampled in GPU shaders for:
  - Infiltration rate (water-height.frag)
  - Friction coefficient (water-velocity.frag)

### 5. Integration with Terrain Visualization

**Updated Files**:

- `src/scene/resources/materials/waterVisualization.ts`
- `src/scene/systems/init/material.ts`

**Changes**:

- Added `uSurfaceMaterialMap` uniform to water visualization material
- Surface material texture is passed during material initialization
- Terrain now displays different colors based on painted materials

### 6. Texture Registry Update

**File**: `src/scene/resources/texture.ts`

- Added `SurfaceMaterialMap` to `TextureEnum` for centralized texture management

### 7. Simulation Resource Update

**File**: `src/renderer/resources/simulation.ts`

- Surface material texture is created and stored in texture cache
- Passed to water flow simulation during initialization

### 8. Documentation

**Files Created**:

- `TERRAIN_PAINTING.md` - Main documentation with usage instructions
- `src/terrain/painting/TERRAIN_PAINTING.md` - Detailed API documentation
- `src/terrain/painting/example.ts` - Usage examples

## Material Properties

| Material      | Infiltration Rate | Friction Coefficient | Visual Color    |
| ------------- | ----------------- | -------------------- | --------------- |
| **Bare Dirt** | 0.5 (moderate)    | 1.0 (normal)         | Brown (#664C33) |
| **Grass**     | 0.8 (high)        | 1.3 (slower flow)    | Green (#339933) |
| **Rocks**     | 0.2 (low)         | 0.8 (faster flow)    | Gray (#808099)  |

## How Materials Affect Water Flow

### Infiltration Rate

- Controls how quickly water is removed from the surface (simulates absorption)
- Higher values = more absorption = less surface water
- Grass absorbs water quickly (0.8), rocks absorb slowly (0.2)

### Friction Coefficient

- Controls how much the material slows water velocity
- Higher values = slower water flow
- Grass creates more friction (1.3), rocks are smoother (0.8)

## Usage Examples

### Programmatic Painting

```typescript
import { createSurfaceMaterialTexture } from "@/scene/resources/textures/surfaceMaterial";

const surfaceMaterialTexture = createSurfaceMaterialTexture(512, 12);
const terrainPainter = createTerrainPainterFromSurfaceMaterial(
  surfaceMaterialTexture,
);

// Paint grass at position (6, 6) with radius 2.0
terrainPainter.paint(6, 6, "grass", 2.0);

// Paint rocks with reduced strength (50%)
terrainPainter.paint(8, 4, "rocks", 1.5, 0.5);
```

### Interactive Mouse Painting

```typescript
import { createTerrainPaintingSystem } from "@/terrain/systems/terrainPaintingSystem";

const paintingSystem = createTerrainPaintingSystem({
  enabled: true,
  brushMaterial: "grass",
  brushRadius: 2.0,
  brushStrength: 1.0,
});

paintingSystem.setTerrainPainter(terrainPainter);
paintingSystem.setCamera(camera);
paintingSystem.setTerrainMesh(terrainMesh);

// In game loop:
function update(deltaTime: number) {
  paintingSystem.update();
}
```

## Keyboard Controls (Interactive Mode)

- **Right-click + Drag**: Paint with current material
- **1**: Switch to bare dirt
- **2**: Switch to grass
- **3**: Switch to rocks
- **+ / =**: Increase brush size
- **- / _**: Decrease brush size

## File Structure

```
src/
├── scene/resources/
│   ├── textures/
│   │   └── surfaceMaterial.ts          # Surface material texture manager
│   └── texture.ts                      # Updated with SurfaceMaterialMap enum
├── terrain/
│   ├── paintTerrain.ts                 # Terrain painter API
│   └── systems/
│       └── terrainPaintingSystem.ts    # Interactive painting system
├── gpu/waterFlowSimulation/
│   ├── createGpuWaterFlowSimulation.ts # Updated to accept surface material map
│   └── variables/
│       └── createGpuWaterHeight.ts     # Updated to use surface material map
├── scene/resources/materials/
│   └── waterVisualization.ts           # Updated to display surface materials
└── terrain/painting/
    ├── TERRAIN_PAINTING.md             # Detailed documentation
    └── example.ts                      # Usage examples

TERRAIN_PAINTING.md                     # Main documentation
```

## Shader Integration

### Water Height Shader (`src/shaders/compute/water-height.frag`)

```glsl
uniform sampler2D surfaceMaterialMap;

float getInfiltrationRate(vec2 uv) {
    vec4 materialData = texture2D(surfaceMaterialMap, uv);
    float materialType = materialData.r;

    if (materialType < 0.5) {
        return INFILTRATION_BARE_DIRT;
    } else if (materialType < 1.5) {
        return INFILTRATION_GRASS;
    } else {
        return INFILTRATION_ROCKS;
    }
}
```

### Water Velocity Shader (`src/shaders/compute/water-velocity.frag`)

```glsl
uniform sampler2D surfaceMaterialMap;

float getMaterialFriction(vec2 uv) {
    vec4 materialData = texture2D(surfaceMaterialMap, uv);
    float materialType = materialData.r;

    if (materialType < 0.5) {
        return FRICTION_BARE_DIRT;
    } else if (materialType < 1.5) {
        return FRICTION_GRASS;
    } else {
        return FRICTION_ROCKS;
    }
}
```

### Terrain Visualization Shader (`src/shaders/water-visualization.frag`)

```glsl
uniform sampler2D uSurfaceMaterialMap;

vec3 getTerrainMaterialColor(vec2 uv) {
    vec4 materialData = texture2D(uSurfaceMaterialMap, uv);
    float materialType = materialData.r;

    if (materialType < 0.5) {
        return vec3(0.4, 0.3, 0.2); // Bare dirt (brown)
    } else if (materialType < 1.5) {
        return vec3(0.2, 0.6, 0.2); // Grass (green)
    } else {
        return vec3(0.5, 0.5, 0.6); // Rocks (gray)
    }
}
```

## Testing the Implementation

### Visual Verification

1. Run the application
2. Observe terrain colors:
   - Brown areas = bare dirt (default)
   - Green areas = grass (where painted)
   - Gray areas = rocks (where painted)

### Water Flow Verification

1. Paint different materials on the terrain
2. Add water using existing controls
3. Observe how water behaves differently:
   - On grass: Water absorbs quickly, flows slowly
   - On rocks: Water stays on surface longer, flows faster
   - On bare dirt: Normal water behavior

## Future Enhancements

Potential improvements:

1. **More Material Types**: Sand, snow, concrete, etc.
2. **Material Blending**: Smoother transitions between materials
3. **UI Panel**: Visual brush controls and material selection
4. **Preset Patterns**: River beds, ponds, etc.
5. **Texture Painting UI**: Visual feedback for brush size and position
6. **Undo/Redo**: Support for painting history

## Conclusion

The terrain painting system is fully integrated into the water flow simulation. Materials now affect both infiltration rate and friction coefficient, making water flow vary based on surface type rather than just terrain height. The system supports both programmatic painting and interactive mouse-based painting with keyboard shortcuts for easy material switching.
