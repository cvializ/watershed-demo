# Water Simulation Implementation with Render Target

## Overview

This implementation demonstrates how to use a **data texture on a separate render target** to calculate new water levels for each point in the height map. The approach leverages GPU acceleration through WebGL shaders to perform pixel-level calculations efficiently.

## Architecture

### Key Components

1. **WaterSimulation Class** (`src/simulation/waterSimulation.ts`)
   - Manages the water texture state
   - Handles render target creation and configuration
   - Updates simulation each frame

2. **Render Target** (`THREE.RenderTarget`)
   - GPU-offscreen rendering buffer
   - Stores calculated water levels as a texture
   - Float32 format for precision

3. **Fragment Shader** (`src/shaders/water-level-calc.frag`)
   - Processes each pixel in parallel
   - Calculates water flow based on terrain height gradients
   - Outputs new water level to render target

4. **Data Texture** (`THREE.DataTexture`)
   - Stores terrain height map data
   - Used as input to shader calculations
   - Also stores computed water levels

## Water Physics Simulation

The fragment shader implements these key calculations:

### 1. Gradient Computation
```glsl
// Sample surrounding heights
float hLeft = texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r;
float hRight = texture2D(uHeightMap, vUv + vec2(eps, 0.0)).r;
float hDown = texture2D(uHeightMap, vUv - vec2(0.0, eps)).r;
float hUp = texture2D(uHeightMap, vUv + vec2(0.0, eps)).r;

// Compute gradient (direction of steepest descent)
vec2 gradient = vec2(hRight - hLeft, hUp - hDown);
```

### 2. Flow Direction
```glsl
// Calculate flow direction (downhill)
float gradientLen = length(gradient) + 0.001;
vec2 flowDir = -normalize(gradient);
```

### 3. Water Advection (Flow)
```glsl
// Read water from upstream position
vec2 upStreamUV = vUv - flowDir * eps * 1.5;
float upstreamWater = texture2D(uWaterMap, clamp(upStreamUV, 0.0, 1.0)).r;

// Water flows downhill carrying water with it
float advectedWater = upstreamWater * 0.85;
```

### 4. Accumulation and Drainage
```glsl
// Calculate terrain properties
float avgSurrounding = (hLeft + hRight + hDown + hUp) * 0.25;
float isBasin = max(0.0, avgSurrounding - terrainHeight);

// Slope-based drainage
float slope = gradientLen;
float elevationFactor = smoothstep(-1.5, 1.0, terrainHeight);
float drain = elevationFactor * slope * 0.15;

// Accumulate water in basins
float accumulation = isBasin * 0.1;
```

### 5. Water Level Update
```glsl
// Combine all effects
float newWater = prevWaterLevel + accumulation - drain * 0.1;

// Mix with advected water (flow effect)
newWater = mix(newWater, advectedWater * 0.5 + prevWaterLevel * 0.3, 0.6);

// Clamp water level
newWater = clamp(newWater, 0.0, 2.0);
```

## Usage Example

```typescript
import { WaterSimulation } from './simulation/waterSimulation.js';

// Create water simulation
const waterSimulation = new WaterSimulation(512, 512);

// Set up shader material with height map
waterSimulation.setupMaterial(heightMapTexture);

// Update simulation each frame
function animate() {
    requestAnimationFrame(animate);
    
    // GPU-based water level calculation
    waterSimulation.update(renderer);
    
    renderer.render(scene, camera);
}
```

## Render Target Pipeline

1. **Input Stage**
   - Height map texture (terrain elevations)
   - Current water level texture

2. **GPU Processing**
   ```
   Fragment Shader:
   - Sample height at (x, z)
   - Compute gradients
   - Calculate flow direction
   - Read upstream water
   - Apply accumulation/drainage
   - Output new water level to render target
   ```

3. **Output Stage**
   - Render target stores new water levels
   - Data texture updated with results
   - Available for visualization and next frame

## Performance Benefits

| Approach | CPU/GPU | Parallelism | Memory |
|----------|---------|-------------|--------|
| CPU-based loop | CPU | Sequential | High (buffers) |
| GPU shader + render target | GPU | Parallel (pixels) | Optimized |

### Key Advantages:
- **Parallel Processing**: All 512×512 = 262,144 pixels processed simultaneously
- **Texture Memory**: GPU-optimized float textures
- **No Data Transfer**: Keep calculations on GPU until final output needed

## Configuration Options

### Texture Resolution
```typescript
// Higher resolution = more detail, slower performance
const simulation = new WaterSimulation(1024, 1024);

// Lower resolution = faster, less detail
const simulation = new WaterSimulation(256, 256);
```

### Shader Constants (in fragment shader)
```glsl
float eps = 1.0 / 512.0;      // Texture sampling offset
float drainRate = 0.15;        // Water drainage speed
float accumulationRate = 0.1; // Basin accumulation
```

## Visualization Integration

The calculated water levels can be used in other shaders:

```typescript
// Water flow material uses the simulation result
const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uWaterMap: { value: waterSimulation.getWaterTexture() },
        // ... other uniforms
    }
});
```

## Extending the Simulation

### Add Evaporation
```glsl
float evaporation = prevWaterLevel * 0.01;
newWater -= evaporation;
```

### Add Rain
```glsl
float rain = sin(uTime * 0.5) * 0.02;
newWater += rain;
```

### Add Infiltration
```glsl
float infiltration = slope * 0.1;
newWater -= infiltration;
```

## Troubleshooting

### Water Not Moving
- Check height map texture is correct format (RedFormat, FloatType)
- Verify shader uniform bindings match
- Ensure render target dimensions match height map

### Visual Artifacts
- Use `THREE.NearestFilter` for data textures
- Check texture wrap mode (repeat vs clamp)
- Verify float texture extension is available

## References

- Three.js RenderTarget: https://threejs.org/docs/#api/en/renderers/WebGLRenderTarget
- DataTexture: https://threejs.org/docs/#api/en/textures/DataTexture
- WebGL Fragment Shaders: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Creating_3D_content_using_WebGL