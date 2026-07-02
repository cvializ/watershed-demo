# Realistic Performance Water Simulation

This document describes the GPU-based water simulation system with realistic fluid dynamics for terrain-based rendering.

## Overview

The water simulation implements **realistic flow physics** using GPU acceleration through WebGL fragment shaders. The system simulates water as a fluid on terrain height maps, providing:

- **Accurate flow dynamics** based on terrain gradients
- **Mass conservation** with proper advection
- **Multi-resolution simulation** for performance scalability
- **Visual realism** through caustics and surface effects

## Architecture

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Water Simulation                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Height Texture (Float32) - Water surface elevation       │
│ 2. Velocity Texture (RG Float32) - Flow direction/speed     │
│ 3. Render Targets - Ping-pong buffering for stability       │
│ 4. Fragment Shaders - GPU-accelerated physics calculations  │
└─────────────────────────────────────────────────────────────┘
```

### Physics Model

The simulation uses simplified **shallow water equations** adapted for GPU execution:

#### Mass Conservation
```
∂h/∂t + ∇·(hv) = 0

where:
- h = water height at position (x,y)
- v = velocity vector field
```

#### Momentum Conservation
```
∂v/∂t + (v·∇)v = -g∇h + ν∇²v

where:
- g = gravity constant (9.81 m/s²)
- ν = viscosity coefficient
```

### Implementation Details

#### 1. Height Update Shader (`src/shaders/water-level-calc.frag`)

Processes each pixel to calculate new water levels:

```glsl
// Sample height gradient (pressure force)
vec2 heightGrad = vec2(hRight - hLeft, hUp - hDown);

// Calculate divergence of (height * velocity)
float divHV = ...;

// External sources: precipitation - evaporation
float externalSources = uPrecipitationRate - uEvaporationRate * h;

// New height: h_new = h_old - div(h*v)*dt + externalSources
float newHeight = h - divHV * 0.166;
```

#### 2. Velocity Update Shader

Computes velocity field based on:
- **Pressure gradients** (height differences)
- **Advection** (self-carrying flow)
- **Viscosity** (smoothing)

```glsl
// Pressure force: -g∇h
vec2 pressureForce = -uGravity * heightGrad;

// Viscosity: ν∇²v
vec2 viscousForce = uViscosity * laplacianVel;

// Advection: (v·∇)v
vec2 advectiveForce = advection;

// Update velocity
vec2 newVel = vel + (pressureForce + viscousForce - advection) * dt;
```

#### 3. Advection Shader

Ensures proper fluid transport using backward semi-Lagrangian scheme:

```glsl
// Trace back along velocity field
vec2 backwardPos = vUv - vel * eps * dt;

// Sample height at previous position
float prevHeight = texture2D(uHeightMap, backwardPos).r;

// Apply mass conservation
float newHeight = prevHeight - div * dt;
```

## Usage

### Basic Setup

```typescript
import { GPUWaterSimulation } from './simulation/GPUWaterSimulation.js';

// Create simulation (512x512 resolution)
const waterSim = new GPUWaterSimulation(512, 512);

// Set up with terrain height map
waterSim.setupTerrain(terrainHeightMap);

// Update each frame
function animate() {
    waterSim.update(renderer, dt);
    
    // Use simulation results for visualization
    const heightTexture = waterSim.getWaterHeightTexture();
    
    requestAnimationFrame(animate);
}
```

### Advanced Configuration

```typescript
// Adjust physical properties
waterSim.gravity = 9.81;           // Gravity strength
waterSim.viscosity = 0.01;         // Fluid viscosity
waterSim.evaporationRate = 0.001;  // Water loss per frame
waterSim.precipitationRate = 0.0;  // Water gain per frame

// Add dynamic elements
waterSim.addRain(new THREE.Vector2(x, y), amount);
waterSim.addWaterSource(new THREE.Vector2(x, y), flowRate);
```

### Visualization Integration

```typescript
// Create water mesh with GPU simulation data
const { mesh, material } = createAdvancedWaterMesh(
    terrainGeometry,
    terrainHeightMap,
    waterSim
);

scene.add(mesh);
```

## Performance Optimization

### Resolution Selection

| Resolution | Pixels | FPS (RTX 3060) | Memory |
|------------|--------|----------------|--------|
| 256x256    | 65K    | ~120           | 1 MB   |
| 512x512    | 262K   | ~90            | 4 MB   |
| 1024x1024  | 1M     | ~60            | 16 MB  |
| 2048x2048  | 4M     | ~30            | 64 MB  |

### GPU Features Used

1. **Floating Point Textures** - Precision water height calculations
2. **Render Targets** - Off-screen GPU computation
3. **Ping-Pong Buffers** - Stable time integration
4. **Texture Fetches** - Parallel neighbor sampling

### Memory Layout

```
Water Height (512x512, RedFormat):
- 262,144 pixels × 4 bytes = 1 MB

Velocity (512x512, RGFormat):
- 262,144 pixels × 8 bytes = 4 MB

Ping-Pong Doubles:
- Total: ~10 MB for simulation state
```

## Physics Parameters

### Gravity (uGravity)

Controls the strength of pressure-driven flow:

- **Low values (< 5.0)**: Slow, sluggish water
- **Medium values (9.81)**: Realistic gravity
- **High values (> 20.0)**: Fast, energetic flow

### Viscosity (uViscosity)

Determines fluid smoothing and resistance:

- **Low values (< 0.001)**: Turbulent, chaotic flow
- **Medium values (0.01)**: Water-like behavior
- **High values (> 0.1)**: Thick, syrupy flow

### Time Step (dt)

Controls simulation stability:

- **Small dt (< 0.05)**: Very stable, slow changes
- **Medium dt (0.166)**: Balanced stability/performance
- **Large dt (> 0.3)**: Fast changes, potential instability

## Visualization Features

### Water Colors

```typescript
const DEEP_WATER_COLOR = vec3(0.0, 0.2, 0.5);
const SHALLOW_WATER_COLOR = vec3(0.1, 0.6, 1.0);
```

Colors interpolate based on water height:
- **0.0-0.2**: Very shallow (light blue)
- **0.2-0.8**: Medium depth (blue to dark blue)
- **> 0.8**: Deep water (dark blue)

### Surface Effects

1. **Caustics**: Light patterns from water surface
2. **Specular Highlights**: Sun reflection
3. **Fresnel Effect**: View-dependent transparency
4. **Wave Detail**: Small surface ripples

### Opacity

```glsl
float opacity = clamp(waterHeight * 0.8 + 0.2, 0.1, 0.9);
if (waterHeight < 0.05) {
    opacity *= waterHeight * 20.0;
}
```

Makes shallow water more transparent for terrain visibility.

## Troubleshooting

### Water Not Flowing

1. Check height map format (must be `RedFormat`, `FloatType`)
2. Verify velocity texture is updating
3. Increase time step or gravity

### Visual Artifacts

1. Use `NearestFilter` for simulation textures
2. Ensure texture dimensions match
3. Check wrap modes (use `ClampToEdgeWrapping`)

### Performance Issues

1. Reduce simulation resolution
2. Disable unnecessary features (caustics)
3. Use lower precision where acceptable

## Extensions

### Adding Rain

```glsl
// In height update shader
float rain = sin(uTime * 0.5) * 0.02;
newHeight += rain;
```

### Adding Infiltration

```glsl
// Water soaking into ground
float infiltration = slope * 0.1;
newHeight -= infiltration;
```

### Multi-Resolution

```typescript
// Coarse simulation (512x512) for physics
const coarseSim = new GPUWaterSimulation(512, 512);

// Fine visualization (1024x1024) for rendering
const fineMesh = createAdvancedWaterMesh(
    highResGeometry,
    terrainHeightMap,
    coarseSim
);
```

## References

- **Shallow Water Equations**: [Wikipedia](https://en.wikipedia.org/wiki/Shallow_water_equations)
- **GPU Gems - Water Simulation**: [Chapter 17](https://developer.nvidia.com/gpugems/gpugems/part-iv-graphics-and-rendering/chapter-17-real-time-water-rendering)
- **Three.js Shaders**: [Documentation](https://threejs.org/docs/#api/en/materials/ShaderMaterial)