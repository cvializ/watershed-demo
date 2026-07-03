# Water Flow Simulation - Quick Reference

## How to Use

### 1. Import the simulation module
```typescript
import { createWaterFlowSimulation } from './nodes/water/createWaterFlowSimulation.js';
```

### 2. Initialize the simulation
```typescript
const waterSimulation = createWaterFlowSimulation(
    128,        // Grid size (128x128)
    terrainSize, // Terrain width in world units
    renderer     // WebGLRenderer instance
);
```

### 3. Update terrain heightmap
```typescript
// In your initialization code, after creating the simulation:
waterSimulation.gpuCompute.compute(); // First computation
const waterTexture = waterSimulation.getWaterTexture();
```

### 4. Use in visualization mode
```typescript
// In animate() loop, when in Water Flow mode:
if (visualizationMode === 4) {
    waterSimulation.gpuCompute.compute(); // Run simulation
    
    const waterTexture = waterSimulation.getWaterTexture();
    terrain.material.uniforms.uWaterHeightmap.value = waterTexture;
}
```

## Water Flow Principles

### Physics Model
1. **Downslope Flow**: Water moves to the neighboring cell with lowest total height (terrain + water)
2. **Flow Rate**: Proportional to slope magnitude and available water
3. **Conservation**: Water removed from source cell, no accumulation (single-pass flow)
4. **Losses**: Infiltration rate (0.98 = 2% loss per frame)

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `simulationSpeed` | 1.0 | Controls flow velocity |
| `infiltrationRate` | 0.98 | Water loss per frame (1 = no loss) |
| `waterSourceStrength` | 0.01 | Water added at center source |

## Architecture

```
┌─────────────────┐
│ Terrain Mesh    │
│ (512x512)       │
└────────┬────────┘
         │ heightmap texture
         ▼
┌──────────────────────────┐
│ Water Simulation Grid    │ 128x128 texels
│ (GPU Compute Shader)     │
│ - Reads terrain height   │
│ - Calculates downslope   │
│ - Transfers water volume │
└────────┬─────────────────┘
         │ water texture
         ▼
┌──────────────────────────┐
│ Visualization Shader     │
│ - Overlays blue water    │
│ - Intensity = water depth│
└──────────────────────────┘
```

## Visual Output

Water appears as:
- **Shallow**: Light blue (RGB: 0.4, 0.7, 1.0)
- **Deep**: Dark blue (RGB: 0.1, 0.3, 0.7)
- **No water**: Terrain color (brownish)

The visualization blends terrain and water based on water height.

## Files Modified/Created

### New
- `src/nodes/water/createWaterFlowSimulation.ts` - Main module
- `src/shaders/water-visualization.frag` - Visualization shader
- `src/shaders/water-visualization.vert` - Vertex shader
- `src/nodes/material/createWaterVisualizationMaterial.ts` - Material creator

### Modified
- `src/main.ts` - Added water mode (mode 4)

## Current Limitations

1. **No accumulation**: Water flows through without pooling
2. **Simplified physics**: No backflow or complex fluid dynamics
3. **Fixed source**: Only center point water injection (can be modified)

## Future Enhancements

1. Add rain sources at arbitrary positions
2. Implement water pooling with pressure equations
3. Add velocity visualization (direction + speed)
4. Support multi-directional (8-way) flow

## Testing

1. Build: `npm run build`
2. Run dev server: `npm run dev`
3. Select "Water Flow" tab in the UI (mode 4)
4. Observe water flowing from center along terrain slopes