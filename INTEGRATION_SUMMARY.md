# Terrain Height Visualization Integration

## Overview
This integration adds a GPU-based height visualization system to the existing terrain scene using functional programming principles rather than object-oriented design.

## Key Changes

### 1. Compute Shader Module (`src/terrainCompute.ts`)
Created a functional compute shader system that:
- Generates terrain height data as a texture
- Provides `createHeightVisualizationMaterial()` - a fragment shader that maps heights to colors
- Uses functional color palette functions (no lookup tables)
- Implements piecewise interpolation for water → land → snow colors

### 2. Main Entry Point (`src/main.ts`)
Updated to:
- Import the terrain compute helper
- Create a `computeMaterial` using `createHeightVisualizationMaterial()`
- Add UI toggle to switch between vertex-colored and GPU-based visualization
- Add height range inputs (min/max) to adjust the color mapping
- Display a color legend showing the height-to-color mapping

## How It Works

### Functional Approach
1. **Pure Functions**: Color palette uses mathematical interpolation functions
2. **No Class State**: Materials are created once and reused
3. **Composable Shaders**: Simple, single-responsibility shader functions

### Pipeline
```
Terrain Generation (existing)
    ↓
Height Texture Generation (new)
    ↓
Fragment Shader Visualization (new)
    ↓
Apply to Terrain Mesh Material
```

## Usage

The UI provides:
- **Toggle Height Visualization**: Switch between vertex colors and GPU shader
- **Min/Max Height Inputs**: Adjust the height range for color mapping

The compute shader material reads from an internal noise function (same as terrain generation) and maps heights to colors using:
- 0.0-0.3: Blue water → Green land
- 0.3-0.7: Green forest to tan rock  
- 0.7-1.0: Tan sand → White snow

## Performance Benefits
- GPU-based height-to-color mapping (instead of CPU vertex colors)
- Real-time parameter updates via uniforms
- Reusable material configuration

## Files Modified/Created
1. `src/terrainCompute.ts` - New: Functional shader system
2. `src/main.ts` - Modified: Integration and UI controls