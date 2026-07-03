# Water Flow on Terrain - Implementation Plan

## Overview
Adapt the GPGPU water simulation from the three.js example to simulate flowing water on terrain (slope-based flow, not standing water).

## Key Architecture Changes

### 1. Compute Shader Logic (flow.frag)
Replace wave equation with gradient-based flow:

**Current (water demo):**
```glsl
// Wave propagation: uses 4 neighbors, oscillates around equilibrium
float newHeight = ((north.x + south.x + east.x + west.x) * 0.5 - heightmapValue.y) * viscosity;
```

**New (flow simulation):**
```glsl
// Calculate downslope direction from terrain height gradient
vec2 gradient = vec2(
    right.x - left.x,
    top.x - bottom.x
);
vec2 downslope = normalize(gradient);

// Flow: move water in downslope direction with speed based on slope
float flowSpeed = slopeMagnitude * baseFlowSpeed;
vec2 flowOffset = downslope * flowSpeed * deltaTime;

// Transfer water to downgradient cells (advect)
newWaterHeight = sampleWaterFrom(upstream, flowOffset);
```

### 2. Data Representation
- **Texture**: `RGBA` where:
  - `R`: water height/concentration (0 = dry, >0 = water present)
  - `G`: unused (could store previous frame for stability)
  - `B, A`: unused
- **Terrain heightmap**: Separate texture (already exists in scene)

### 3. Flow Physics
Instead of wave oscillation:
1. Calculate terrain gradient (slope direction/magnitude)
2. Determine which neighbor is lowest (downslope)
3. Transfer water from current cell to downslope cell
4. Apply infiltration/evaporation losses

### 4. Integration Points

**Input uniforms needed:**
- `terrainHeightmap`: Existing terrain height data
- `waterHeightmap`: Water simulation texture (from previous frame)
- `cellSize`, `simulationSpeed`, `infiltrationRate`

**Shader flow:**
```
For each cell:
  1. Read terrain height (h_terrain)
  2. Read current water height (h_water)
  3. Calculate terrain gradient
  4. Find downslope neighbor (lowest h_terrain + h_water)
  5. Transfer Δwater = min(h_water, slope × speed) to neighbor
  6. Apply losses: h_water *= (1 - infiltration)
```

## Implementation Steps

### Phase 1: Terrain Gradient Shader
Create compute shader that reads terrain and outputs flow direction vectors.

### Phase 2: Advection Shader  
Transfer water along gradient directions to neighboring cells.

### Phase 3: Loss Physics
Add infiltration (water soaking into ground) and evaporation.

## Performance Considerations
- Use nearest neighbor filtering for sharp gradient calculations
- Double-buffer water height texture
- Consider using WebGL 2 compute shaders for more flexibility

## Testing Strategy
1. Start with flat terrain + single water source → radial flow
2. Add slope → verify unidirectional flow
3. Integrate with actual terrain mesh