# Water Simulation with Render Target

This implementation uses a data texture on a separate render target to calculate new water levels for each point in the height map.

## Files Created/Modified

### New Files:
1. **src/nodes/material/createWaterLevelCalculationMaterial.ts** - Creates shader material for water level calculation
2. **src/shaders/water-level-calc.vert** - Vertex shader for water level calculation
3. **src/shaders/water-level-calc.frag** - Fragment shader for water level calculation (GPU simulation)
4. **src/simulation/readRenderTarget.ts** - Utility functions for reading render target data
5. **src/simulation/waterSimulation.ts** - Main water simulation class using render targets

### Modified Files:
- **src/main.ts** - Updated to use the new WaterSimulation class

## How It Works

### Render Target Approach
The water simulation uses a `THREE.RenderTarget` with a data texture to perform GPU-based calculations:

1. **Initial Setup**: Creates an initial water level texture (uniform coverage = 1.0)

2. **Shader Material**: A custom shader that:
   - Reads current water levels from `uWaterMap`
   - Samples terrain height from `uHeightMap`
   - Calculates flow direction based on height gradients
   - Simulates water accumulation in basins
   - Drains water from high slopes
   - Outputs new water levels to the render target

3. **GPU Calculation**: The fragment shader processes each pixel in parallel:
   ```glsl
   // For each point (x, z) in the height map:
   - Read current water level
   - Sample surrounding terrain heights
   - Calculate slope and gradient
   - Determine flow direction (downhill)
   - Read upstream water contribution
   - Calculate accumulation vs drainage
   - Output new water level to render target
   ```

4. **Ping-Pong Rendering**: Uses two render targets for iterative simulation:
   - Current frame reads from one target
   - Writes results to the other target
   - Swaps buffers each frame

## Usage

```typescript
// Create water simulation
const waterSimulation = new WaterSimulation(512, 512);

// Set up material with height map
waterSimulation.setupMaterial(heightMapTexture);

// Update simulation each frame
waterSimulation.update(heightMapTexture);

// Get the water texture for visualization
const waterTexture = waterSimulation.getWaterTexture();
```

## Key Features

- **GPU Acceleration**: Water level calculations run entirely on the GPU
- **Data Texture Output**: Results stored in Float32 data texture for precision
- **Shader-based Simulation**: Uses fragment shaders to process each point in parallel
- **Visual Feedback**: Water color based on level (deep = dark blue, shallow = light)

## Benefits of Render Target Approach

1. **Performance**: GPU processes all points in parallel
2. **Memory Efficient**: Reuses textures for simulation state
3. **Flexible**: Easy to modify shader for different physics
4. **Scalable**: Works with any texture resolution