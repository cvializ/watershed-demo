# Cloud Shadow Water Deposition System

## Overview

This implementation adds a **cloud shadow water deposition effect** to the terrain simulation. As clouds drift across the landscape, they slowly add small amounts of water where their shadows fall - simulating condensation from cooling air under clouds.

## Architecture

The system follows a **hybrid approach** where:

1. **Cloud System** (`createCloudShadowSystem.ts`):
   - Generates procedurally moving clouds
   - Tracks cloud positions, sizes, and intensities
   - Returns uniform data for the water shader

2. **Water Simulation** (`createD8Simulation.ts`):
   - Receives cloud uniform data each frame
   - Calculates cloud shadow intensity at each grid cell
   - Adds water proportional to shadow intensity

## Key Components

### 1. CloudShadowSystem (`src/systems/createCloudShadowSystem.ts`)

```typescript
type CloudShadowConfig = {
    cloudCount: number;        // Number of active clouds (default: 8)
    speed: number;             // Movement speed multiplier
    maxCloudSize: number;      // Maximum cloud radius in world units
    depositionRate: number;    // Water deposition rate
    evaporationRate: number;   // Water decay rate
};

type CloudShadowSystem = {
    update: (deltaTime: number) => {
        cloudUniforms: THREE.Vector4[];  // Array of (x, y, size, intensity)
        time: number;
    };
    getConfig: () => CloudShadowConfig;
};
```

### 2. Modified D8 Water Simulation Shader

The fragment shader now includes cloud shadow calculation:

```glsl
// Cloud uniforms (array of up to 16 clouds)
uniform vec4 uClouds[16];   // (x, y, size, intensity)
uniform int uCloudCount;    // Number of active clouds

// Calculate cloud shadow at world position
float calculateCloudShadow(vec2 point, vec4 cloud) {
    float dx = point.x - cloud.x;
    float dy = point.y - cloud.y;
    float distSq = dx * dx + dy * dy;
    float radiusSq = cloud.z * cloud.z;
    
    if (distSq < radiusSq) {
        float t = 1.0 - distSq / radiusSq;
        return cloud.w * t * t * (3.0 - 2.0 * t); // Smoothstep with intensity
    }
    return 0.0;
}

// In main():
float cloudShadow = getTotalCloudShadow(worldPos);
if (cloudShadow > 0.001) {
    cloudDeposition = cloudShadow * 0.015; // Water deposition
}
newWaterHeight += cloudDeposition + userAddAmount;
```

### 3. WaterFlowVisualization Type Update

```typescript
type WaterFlowVisualization = {
    compute: (cloudUniforms?: THREE.Vector4[], cloudCount?: number) => void;
    getWaterTexture: () => THREE.Texture;
    addWater: (x: number, y: number, amount: number, radius: number) => void;
};
```

## Usage

### Initialization (main.ts)

```typescript
import { createCloudShadowSystem } from './systems/createCloudShadowSystem.js';

// Create cloud shadow system with default or custom config
const cloudShadowSystem = createCloudShadowSystem({
    cloudCount: 8,
    speed: 0.3,
    maxCloudSize: 3.0,
});

// Update water simulation with cloud data
const cloudData = cloudShadowSystem.update(deltaTime);
waterSimulation.compute(cloudData.cloudUniforms, cloudData.cloudUniforms.length);
```

### Cloud Behavior

- **Movement**: Clouds drift across the terrain, wrapping around edges
- **Shape**: Soft-edged circular shadows using smoothstep falloff
- **Intensity**: Varies over time with slight oscillation
- **Water Deposition**: Slow, continuous addition where shadows fall

## Technical Details

### Soft-Edge Cloud Shadows

Clouds use a smoothstep function for natural falloff:

```
shadow = intensity * t²(3 - 2t) where t = 1 - (dist/radius)²
```

This creates gradual transitions at cloud edges rather than hard boundaries.

### Water Deposition Rate

The rate is set to `0.015` per frame, which:
- Creates visible water accumulation over several seconds
- Doesn't overwhelm the terrain
- Works with the existing D8 flow simulation

### Cloud Array Limit

Supports up to **16 clouds** via uniform array. This can be increased by:
- Modifying the shader to use a larger array
- Using a texture-based approach for unlimited clouds

## Performance Considerations

1. **Cloud Count**: 8-16 clouds provides good visual results with minimal GPU cost
2. **Shader Calculation**: Simple distance-based calculations per fragment
3. **Uniform Updates**: Minimal CPU overhead for array updates

## Future Enhancements

Potential improvements to consider:

1. **Cloud Textures**: Use noise textures for more realistic cloud shapes
2. **Multiple Layers**: Different cloud layers at different altitudes
3. **Weather Effects**: Correlate cloud density with rainfall patterns
4. **Wind Direction**: Vary cloud movement direction across the terrain
5. **Terrain Correlation**: Clouds favor certain elevation ranges

## Files Modified/Created

- **Created**: `src/systems/createCloudShadowSystem.ts`
- **Modified**: 
  - `src/systems/createD8Simulation.ts` (added cloud shadow shader)
  - `src/types/water-flow.ts` (updated compute signature)
  - `src/main.ts` (integration with cloud system)

## Testing

To test the implementation:

1. Run `npm run validate` to ensure all tests pass
2. Launch the application: `npm start`
3. Navigate to **Water Flow** visualization mode
4. Observe water slowly accumulating under drifting clouds
5. Click to add manual water drops (clouds continue depositing)