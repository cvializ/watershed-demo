# Surface Material-Based Erosion and Deposition

This document describes how erosion and deposition rates in the water simulation vary based on surface material types.

## Overview

The sediment flow simulation now accounts for different surface materials, making the erosion and deposition physics more realistic. Different materials have varying resistance to erosion and affect how sediment is deposited.

## Material Types

The system supports three surface material types:

1. **Bare Dirt** (ID: 0.0)
   - Baseline erosion resistance (1.0)
   - Moderate deposition factor (1.0)
   - Standard erosion/deposition behavior

2. **Grass** (ID: 1.0)
   - High erosion resistance (0.3) - grass roots stabilize soil
   - High deposition factor (1.5) - vegetation slows water, causing more sediment to settle
   - Results in less erosion and more deposition

3. **Rocks** (ID: 2.0)
   - Very high erosion resistance (0.1) - rocks are difficult to erode
   - Low deposition factor (0.8) - smooth surfaces keep sediment in motion
   - Results in minimal erosion and less deposition

## Implementation Details

### Shader Changes (`src/shaders/compute/sediment-flow.frag`)

The sediment flow shader now includes:

1. **Material Erosion Resistance**: Multiplies the transport capacity by a material-specific factor
   ```glsl
   float erosionResistance = getMaterialErosionResistance(uv);
   float transportCapacity = velocityMagnitude * velocityMagnitude * baseErosionRate * erosionResistance;
   ```

2. **Material Deposition Factor**: Modifies how much sediment is deposited when flow diverges
   ```glsl
   float depositionFactor = getMaterialDepositionFactor(uv);
   erosionDeposition = -divergence * transportCapacity * depositionFactor;
   ```

### TypeScript Changes

- **`createGpuSedimentFlow.ts`**: Added `surfaceMaterialMap` uniform to pass the material texture to the shader
- **`createGpuWaterFlowSimulation.ts`**: Updated to pass surface material map to sediment flow variable
- **`simulation.ts`**: Renamed `erosionRate` to `baseErosionRate` for clarity

## Physics Model

The erosion/deposition calculation follows these principles:

1. **Transport Capacity**: Scales with velocity² × baseErosionRate × materialResistance
   - Higher velocity = exponentially more sediment carried
   - Material resistance reduces the amount of terrain that can be eroded

2. **Erosion (Converging Flow)**: When flow converges (negative divergence), sediment is removed from the terrain
   - Material resistance directly reduces erosion rate

3. **Deposition (Diverging Flow)**: When flow diverges (positive divergence), carried sediment is deposited
   - Material deposition factor affects how much settles vs. stays in motion

## Usage Example

```typescript
// Paint grass on terrain (reduces erosion, increases deposition)
waterSimulation.addWater(x, y, amount, radius);

// Grass areas will:
// - Erode 70% less than bare dirt (erosion resistance: 0.3)
// - Deposit 50% more sediment (deposition factor: 1.5)

// Paint rocks on terrain (very resistant to erosion)
surfaceMaterialTexture.paint(x, y, "rocks", radius);

// Rocky areas will:
// - Erode 90% less than bare dirt (erosion resistance: 0.1)
// - Deposit 20% less sediment (deposition factor: 0.8)
```

## Benefits

1. **Realistic Terrain Evolution**: Grass-covered areas remain stable while bare dirt erodes more easily
2. **Natural Sediment Patterns**: Vegetation causes sediment to settle, creating realistic deposition zones
3. **Material Persistence**: Rocks resist erosion, maintaining terrain features over time
4. **Visual Feedback**: Different materials create distinct erosion patterns visible in the simulation

## Future Enhancements

Potential improvements:
- Add more material types (sand, clay, snow)
- Make erosion coefficients configurable per material
- Add time-dependent changes (grass growth/death affecting resistance)
- Support layered materials with blending