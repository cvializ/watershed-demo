# Water Disappearance Diagnosis

## Problem Statement
When infiltration rate is set to disable infiltration (value of 1.0), water still disappears without flowing all the way downhill.

## Root Causes Identified

### 1. Drainage Rate Always Applied (PRIMARY ISSUE) ✓ FIXED
**Location**: `src/systems/createWaterFlowSimulation.ts`, line 312 (default value)

**Issue**: Even when `infiltrationRate = 1.0` (no infiltration), the drainage was still applied with `drainageRate = 0.05`, which removes 5% of water every frame.

**Fix**: Changed `drainageRate` default from 0.05 to 0.0, so when infiltration is disabled, all water remains on terrain.

**Impact**: Water gradually disappeared over time regardless of infiltration setting.

### 2. Outflow/Inflow Consistency Bug ✓ FIXED
**Location**: `src/systems/createWaterFlowSimulation.ts`, line 65

**Issue**: The outflow calculation used `newWaterHeight = current + addAmount` but the inflow calculation read from the old water buffer using only `currentWaterHeight`. This caused a conservation issue:
- When user adds water, outflow included the added amount
- But inflow to neighbors didn't include it (neighbors read old water value)
- Result: water was "lost" each frame

**Fix**: Changed outflow from `newWaterHeight * simulationSpeed` to `currentWaterHeight * simulationSpeed`.

This ensures that:
- Outflow from cell A = `current_A * speed`
- Inflow to cell B from A = `current_A * speed`
- Water is conserved for existing water
- Added water (from user click) flows in the NEXT frame when it's now part of `current`

### 3. Slope Not Used in Inflow Calculation (INCONSISTENCY)
**Location**: `src/systems/createWaterFlowSimulation.ts`, lines 117-120, 158-161, etc.

**Issue**: The inflow calculation determines if a neighbor flows to this cell, but doesn't check if the slope is sufficient. The slope is calculated (`northToSouthSlope`) but never used to limit the inflow amount.

**Current behavior**: If a neighbor flows to this cell, it adds `neighborWater * simulationSpeed` regardless of slope.

**Impact**: Water can flow even when the slope is very shallow (practically flat).

**Note**: This is a minor inconsistency. The outflow requires `slope > 0.001` but inflow doesn't have this check. The simulation still works because the neighbor wouldn't flow to this cell if there's no lower neighbor.

## Files Involved

- `src/systems/createWaterFlowSimulation.ts` - Main simulation shader (FIXED)
- `src/main.ts` - Application code using simulation
- `src/WATER_FLOW_IMPLEMENTATION.md` - Original implementation docs

### 2. Water Conservation Issue in Inflow Calculation
**Location**: `src/systems/createWaterFlowSimulation.ts`, lines 89-325

**Issue**: The inflow calculation checks if neighbors flow TO this cell, but doesn't verify:
- That the neighbor actually has water to contribute
- That the outflow from the neighbor matches this cell's inflow

Example (north neighbor, line ~89):
```glsl
if (northLowestDir == 1 && northMinTotal < northTotalHeight) {
    float southTotal = terrainHeight + newWaterHeight;
    float northToSouthSlope = northTotalHeight - southTotal;
    inflow += northWater * simulationSpeed;  // ⚠️ Adds based on neighbor's water, not actual outflow
}
```

**Expected**: Only add water that the neighbor actually loses (outflow calculation should match inflow).

### 3. No Boundary Conditions for Water Accumulation
**Location**: `src/systems/createWaterFlowSimulation.ts`, lines 135-320

**Issue**: The shader doesn't distinguish between:
- Water flowing within the terrain
- Water reaching edges (should pool or be absorbed)

Water at edges continues to flow "out of bounds" and is lost.

## Recommendations

### Immediate Fix: Separate Infiltration from Drainage
The `infiltrationRate` and `drainageRate` should be independent:

1. **Infiltration**: Water soaking into terrain (multiplicative loss)
2. **Drainage**: Simulated evaporation/runoff to ocean (optional)

When infiltration is disabled (`infiltrationRate = 1.0`), drainage should also be controllable:
- Set `drainageRate = 0.0` to prevent any loss
- Keep `drainageRate > 0.0` for realistic evaporation

### Better Solution: Add Drainage Control
Add a `disableDrainage` uniform or set drainage rate to 0 when infiltration is disabled.

## Debugging Steps

1. Set `infiltrationRate = 1.0` and `drainageRate = 0.0`
2. Add water at a high point on terrain
3. Observe if water flows downhill and accumulates
4. If water still disappears, check:
   - Boundary conditions (water flowing off edges)
   - Inflow/outflow balance (conservation check)

## Files Involved

- `src/systems/createWaterFlowSimulation.ts` - Main simulation shader
- `src/main.ts` - Application code using simulation
- `src/WATER_FLOW_IMPLEMENTATION.md` - Original implementation docs

## Test Case

To verify the fix:

```typescript
// In createWaterFlowSimulation(), temporarily set:
waterHeightVariable.material.uniforms.drainageRate = { value: 0.0 };
```

Then:
1. Run simulation
2. Click to add water at a high point
3. Water should flow downhill and accumulate in low areas
4. No gradual disappearance over time