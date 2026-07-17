# Implementation Notes

## Current State Analysis

Looking at the codebase, I see that:

1. **ECS Pattern Already Exists**: The project uses bitecs with components like `MaterialRef`, `MeshRef`, `Terrain`
2. **Material System Exists**: There's already a `materialSystem` that syncs materials from world to scene
3. **UI Already Implemented**: The GameUI.tsx has a dropdown that updates `world.showVelocity`
4. **Water Simulation**: Already in place with GPU computation

## Key Findings from index-old.ts

The old implementation has:
- 5 visualization modes (0-4):
  - Mode 0: Height-based visualization
  - Mode 1: Slope-based visualization  
  - Mode 2: Normal material (verification)
  - Mode 3: Downslope arrows
  - Mode 4: Water flow visualization

## What Needs to Be Migrated

### 1. Component Enhancement
Add `VisualizationMode` component to track current mode:
```typescript
export const VisualizationMode = {
  mode: f32([]), // 0=Height, 1=Slope, 2=Normal, 3=Downslope, 4=Water
};
```

### 2. Material Resource Functions
Create functions to generate all visualization materials:
- Height visualization (already has resource creator)
- Slope visualization
- Downslope arrows material
- Debug materials

### 3. Init Systems
Create init systems that:
- Create materials when entities are added with specific component combinations
- Create downslope arrow geometry
- Handle material switching

### 4. Sync Systems  
Create sync systems that:
- Read visualization mode from world
- Apply correct material to terrain mesh
- Show/hide downslope arrows

## Implementation Approach

1. First, add the VisualizationMode component
2. Create material resource functions for all visualization types
3. Create init systems to create resources on entity creation
4. Create sync systems to apply materials based on world state
5. Update UI to use world state for material selection

## Important: The Material System is Already Synced
The existing `materialSystem` already handles switching materials from world to scene.
We just need to:
1. Store the visualization mode in world state
2. Update MaterialRef.ref[entity$] with appropriate material UUID based on mode
3. Let the existing sync system handle the rest

## World State Enhancement
Add visualization mode to GameWorldContext:
```typescript
export const createGameWorldContext = () => ({
  // ... existing fields
  visualizationMode: f32([]), // or just use world.visualizationMode directly
});
```

Actually, looking at the existing code, `world.showVelocity` is already a boolean flag.
We can extend this pattern for multiple visualization modes.