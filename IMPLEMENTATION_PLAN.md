# Surface Materials Implementation Plan

## Overview
Add surface materials (grass, rocks, bare dirt) that affect water flow rate and determine terrain color.

## Implementation Steps

### 1. Create Surface Material Type Definition
- Define material types: `BareDirt = 0`, `Grass = 1`, `Rocks = 2`
- Each material has properties:
  - **Infiltration rate**: How much water soaks into ground (low for rocks, high for grass)
  - **Surface friction**: Affects flow velocity
  - **Color**: Visual representation

### 2. Generate Surface Material Texture
- Create a texture that stores material data per texel (R channel)
- Generate materials based on terrain characteristics:
  - **Bare Dirt**: Medium elevation, gentle slopes
  - **Grass**: Higher elevations, areas with more water retention
  - **Rocks**: High elevations, steep slopes

### 3. Update GPU Water Simulation
- Modify `water-velocity.frag` to:
  - Sample surface material texture
  - Apply material-specific flow resistance (friction)
  - Adjust velocity based on material properties
  
- Modify `water-height.frag` to:
  - Sample surface material texture
  - Apply material-specific infiltration (drainage)
  - Rocks have low infiltration (water stays on surface), grass has higher infiltration

### 4. Update Terrain Geometry
- Modify `createTerrainGeometry()` to generate surface material data per vertex
- Store materials as a texture that can be used by shaders

### 5. Update Visualization Shader
- Modify `water-visualization.frag` to:
  - Sample surface material texture
  - Apply material colors (green for grass, gray for rocks, brown for bare dirt)
  - Blend terrain color with material color

### 6. Data Flow
```
Terrain Generation → SurfaceMaterialTexture
                        ↓
        GPU Water Simulation (velocity + height)
                        ↓
        Visualization Shader (color based on material)
```

## File Changes Required

1. **New**: `src/types/surfaceMaterials.ts` - Type definitions
2. **Modify**: `src/nodes/geometry/createTerrainGeometry.ts` - Add material generation
3. **Modify**: `src/shaders/compute/water-velocity.frag` - Add material influence
4. **Modify**: `src/shaders/compute/water-height.frag` - Add infiltration based on material
5. **Modify**: `src/shaders/water-visualization.frag` - Add material colors
6. **Modify**: `src/gpu/createGpuWaterFlowSimulation.ts` - Pass material texture
7. **Modify**: `src/scene/resources/terrain.ts` - Register material texture

## Key Design Decisions

1. **Storage**: Use a single-channel float texture for materials (values 0.0, 1.0, 2.0)
2. **Material Properties** (to be tuned):
   - Bare Dirt: infiltration=0.5, friction=1.0
   - Grass: infiltration=0.8, friction=1.2 (slower flow)
   - Rocks: infiltration=0.2, friction=0.8 (faster flow over smooth rocks)

3. **Material Generation**: Based on terrain characteristics:
   - High elevation + steep slope → Rocks
   - Medium-high elevation + gentle slope → Grass  
   - Medium elevation + moderate slope → Bare Dirt