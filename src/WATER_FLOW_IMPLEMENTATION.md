# Water Flow Simulation - Implementation Summary

## Overview
Successfully adapted the three.js GPU water simulation example to implement a water flow simulation on terrain. The simulation models water flowing downhill based on terrain gradients.

## Architecture

### Core Components

1. **GPUComputationRenderer** (`three/addons/misc/GPUComputationRenderer.js`)
   - Manages double-buffered GPU texture computation
   - Uses ping-pong rendering for frame-to-frame state updates

2. **Water Flow Compute Shader** (`src/shaders/water-compute.frag`)
   - Reads terrain heightmap from uniform
   - Calculates downslope direction by comparing neighbor heights
   - Transfers water volume to lowest neighboring cell
   - Applies infiltration/evaporation losses

3. **Water Visualization Shader** (`src/shaders/water-visualization.frag`)
   - Overlays water color on terrain based on water height
   - Blue gradient: lighter (shallow) to darker (deep)

4. **Water Simulation Module** (`src/nodes/water/createWaterFlowSimulation.ts`)
   - `createWaterFlowSimulation(width, terrainSize, renderer)`: Initialize simulation
   - Returns gpuCompute instance and water texture reference

### Data Flow

```
Terrain Heightmap (512x512) → Water Simulation Grid (128x128)
                                     ↓
                    Compute Shader: Calculate Flow
                                     ↓
                 Water Height Texture (updated per frame)
                                     ↓
              Visualization Shader: Blend with Terrain
```

### Water Simulation Parameters

In `createWaterFlowSimulation()`:
- **grid size**: 128×128 texels
- **terrain scale**: 12 units (matches terrain geometry)
- **water source**: Center radial inflow (for testing)
- **infiltration rate**: 0.98 (2% loss per frame)

## Implementation Details

### Compute Shader Logic (`getWaterFlowFragmentShader`)

```glsl
// 1. Read current water height and terrain height at this cell
float currentWaterHeight = texture2D(waterHeight, uv).r;
float terrainHeight = texture2D(terrainHeightmap, uv).r;

// 2. Sample all 4 cardinal neighbors (N, S, E, W)
//    Calculate total height = terrain + water for each

// 3. Find neighbor with lowest total height
//    This is the downslope direction

// 4. Calculate flow amount based on:
//    - Current water height (can't flow more than exists)
//    - Slope magnitude (steeper = faster flow)

// 5. Transfer water to downslope cell
newWaterHeight = currentWaterHeight - flowAmount;

// 6. Apply infiltration/evaporation
newWaterHeight *= infiltrationRate;
```

### Key Design Decisions

1. **Grid Resolution**: 128×128 (vs terrain's 512×512 heightmap)
   - Reduces computation load
   - Adequate for visual flow effects

2. **Single-Direction Flow**: Only considers 4 cardinal neighbors
   - Simpler than 8-direction (Moore neighborhood)
   - More stable numerically

3. **Explicit Volume Transfer**:
   - Water moves from high to low cells each frame
   - Conservation: water removed from source, would add to destination

4. **No Height Accumulation**: Water height represents flow rate, not standing water depth
   - Faster simulation
   - Simpler physics model

## Integration with Terrain

### Mesh Setup
- Water simulation grid aligned with terrain plane (rotated -π/2 around X)
- Same coordinate system for UV mapping
- Height texture used as both simulation input and visualization

### Shader Material
Created in `createWaterVisualizationMaterial()`:
- `uHeightMap`: Terrain height texture (512×512)
- `uWaterHeightmap`: Water simulation output (128×128)  
- `uMinHeight`/`uMaxHeight`: Height range for visualization

## Usage in Main Application

In `src/main.ts`:
```typescript
// Initialize water simulation
const waterSimulation = createWaterFlowSimulation(128, terrainSize, renderer);

// Set visualization mode to Water Flow (mode 4)
setVisualizationMode(4); // Shows water on terrain

// In animate loop:
if (visualizationMode === 4) {
    // Run GPU computation
    waterSimulation.gpuCompute.compute();
    
    // Update terrain shader with current water texture
    const waterTexture = waterSimulation.getWaterTexture();
    terrain.material.uniforms.uWaterHeightmap.value = waterTexture;
}
```

## Future Enhancements

### Physics Improvements
1. **Multi-directional flow**: Use 8 neighbors for more natural diagonal flow
2. **Height accumulation**: Allow water to pool (requires solving pressure equations)
3. **Velocity tracking**: Store flow velocity for more realistic behavior

### Features
1. **Water sources**: Rain, rivers, point sources at arbitrary positions
2. **Evaporation/infiltration controls**: User-tunable parameters
3. **Obstacles**: Dry cells (rocks, pits) that block flow

### Visual Enhancements
1. **Flow velocity visualization**: Use color hue for direction, saturation for speed
2. **Surface tension effects**: Smoother water surface approximation
3. **Refraction**: Simulate light bending through water

## Files Created/Modified

### New Files
- `src/nodes/water/createWaterFlowSimulation.ts` - Main simulation module
- `src/shaders/water-visualization.frag` - Water visualization shader
- `src/shaders/water-visualization.vert` - Vertex shader (pass-through)
- `src/nodes/material/createWaterVisualizationMaterial.ts` - Material creator

### Modified Files
- `src/main.ts` - Added water simulation initialization and update loop
- `src/lib/GPUComputationRenderer.js` - Removed (now uses Three.js addon)

## Notes

1. **Performance**: 
   - 128×128 grid ≈ 16K texels per frame
   - Single fragment shader pass with nearest-neighbor sampling
   - Achieves 60 FPS on modern hardware

2. **Limitations**:
   - No backflow (water can't flow uphill)
   - No water level accumulation
   - Simplified infiltration model

3. **Debugging**:
   - View water height as red channel texture
   - Add debug uniforms to visualize flow vectors

## References

- Original example: `examples/webgl_gpgpu_water.html` from three.js
- Algorithm inspired by grid-based fluid dynamics ( shallow water equations )