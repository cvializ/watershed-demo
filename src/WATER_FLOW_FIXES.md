# Water Flow Simulation Fixes

## Summary of Changes

### Problem
When infiltration rate was set to 1.0 (disable infiltration), water disappeared without flowing all the way downhill.

### Root Causes

#### 1. Drainage Rate Too High
- **Before**: `drainageRate = 0.05` (5% water loss per frame)
- **After**: `drainageRate = 0.0` (no water loss when infiltration disabled)

When infiltration is disabled (`infiltrationRate = 1.0`), users expect ALL water to remain on terrain. The drainage was removing 5% of water every frame, causing gradual disappearance.

#### 2. Outflow/Inflow Inconsistency
- **Before**: `outflow = newWaterHeight * simulationSpeed`
- **After**: `outflow = currentWaterHeight * simulationSpeed`

The original code used `newWaterHeight` (current + added) for outflow but read the old water value (`currentWaterHeight`) from neighbors for inflow. This caused:
- Water added via user click would flow out in the same frame
- But neighbors couldn't receive it (they read old water value)
- Result: "lost" water and apparent conservation failure

By using `currentWaterHeight` for outflow, we ensure:
- Outflow = what the cell currently has
- Inflow from neighbors = same current water value
- Conservation is maintained for existing water
- Added water flows in the NEXT frame (when it's now part of current)

## Files Modified

### `src/systems/createWaterFlowSimulation.ts`

**Line 65**: Changed outflow calculation
```glsl
// Before:
outflow = newWaterHeight * simulationSpeed;

// After:
outflow = currentWaterHeight * simulationSpeed;
```

**Line 312**: Changed drainage rate default
```typescript
// Before:
waterHeightVariable.material.uniforms.drainageRate = { value: 0.05 };

// After:
waterHeightVariable.material.uniforms.drainageRate = { value: 0 };
```

## How to Use

### To disable infiltration and keep all water on terrain:
```typescript
// Already the default behavior now
waterHeightVariable.material.uniforms.infiltrationRate = { value: 1.0 };
// Drainage is also set to 0, so all water stays on terrain
```

### To add infiltration (water loss):
```typescript
waterHeightVariable.material.uniforms.infiltrationRate = { value: 0.98 };
// This loses 2% of water per frame to infiltration
```

### To add drainage (evaporation/runoff):
```typescript
waterHeightVariable.material.uniforms.drainageRate = { value: 0.01 };
// This loses 1% of remaining water per frame to drainage
```

## Testing

Run the simulation:
1. Start the app: `npm run dev`
2. Select "Water Flow" tab (mode 4)
3. Click on a high point on the terrain to add water
4. Water should flow downhill and accumulate in low areas
5. No gradual disappearance over time

Verify with the validation script:
```bash
npm run validate
```

All tests should pass.