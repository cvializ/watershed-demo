# Material Visualization ECS Migration Plan

## Overview
Migrate material visualization from `index-old.ts` to the ECS pattern. The materials should be selectable from a dropdown UI and conform to the existing ECS structure.

## Existing ECS Structure

### Components (src/components/components.ts)
- `MaterialRef` - Stores material UUID reference
- `MeshRef` - Stores mesh ID reference
- `Terrain` - Tag component for terrain entity

### Resources (src/scene/resources/)
- `material.ts` - Material cache with `getMaterial()` and resource creation functions
- `terrain.ts` - Creates terrain mesh
- `wireframe.ts` - Creates wireframe overlay

### Systems (src/scene/systems/)
- `materialSystem` (sync) - Syncs material references from world to scene
- `positionSystem` (sync) - Syncs position from world to scene

### Init Systems (src/scene/systems/init/)
- `refsInitSystem` - Creates initial resources on entity creation

## Material Types to Support
1. **Height Visualization** - Color based on terrain height
2. **Slope Visualization** - Color based on surface normals (downslope calculation)
3. **Downslope Arrows** - Line segments showing flow direction
4. **Water Flow** - Combined height + water visualization
5. **Debug Options** - Height range, position, depth, face normal, displacement, time

## Implementation Steps

### 1. Add Material Types Enum (src/types/surfaceMaterials.ts)
Already exists! Just need to add visualization mode types.

### 2. Create Visualization Mode Component
Add to `src/components/components.ts`:
```typescript
export const VisualizationMode = {
  mode: f32([]), // 0=Height, 1=Slope, 2=Normal, 3=Downslope, 4=Water
};
```

### 3. Create Material Resource Functions (src/scene/resources/material.ts)
Add functions for:
- `createDownslopeArrowMaterialResource()`
- Add visualization mode handling to material creation

### 4. Create Material Init System (src/renderer/systems/init/)
Create `material.ts` init system that:
- Observes entities with `Terrain` and `MaterialRef`
- Creates appropriate materials based on visualization mode
- Caches materials in the material cache

### 5. Create Downslope Arrow System (src/renderer/systems/)
- Creates downslope arrow geometry and lines
- Updates arrows based on terrain normals (downslope calculation)
- Handles visibility toggle

### 6. Update UI
Modify `src/ui/GameUI.tsx` to use world state for current material mode

### 7. Update Resources
Create helper functions in `src/scene/resources/material.ts` for all material types

## Key Technical Details

### Downslope Calculation (from PlaneGeometry)
The terrain is rotated by -π/2 around X-axis:
- Pre-rotation normal for heightfield z=f(x,y): (fx, fy, -1) normalized
- After X-rotation of -π/2: approximately (fx, 1, fy) normalized
- Downslope direction from rotated normal: (nx/nz, ny/nz)

### Material Switching Flow
1. User selects material from dropdown in UI
2. UI updates `world.visualizationMode`
3. System reads `world.visualizationMode` and updates entity's `VisualizationMode.mode`
4. Material init system creates/retrieves appropriate material
5. Sync system applies material to scene mesh