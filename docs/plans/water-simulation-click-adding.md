# Plan: Add water to ongoing simulation via uniform texture

## Problem

The current `addWater` function modifies `initialValueTexture` (the initial state DataTexture) and copies it to both render targets. This approach:
- Mutates the initial texture directly (CPU-side array writes)
- Overwrites both render targets completely instead of adding to existing simulation state
- Loses any water that was already flowing in the simulation

## Goal

Add clicked water to the *ongoing simulation state* by passing a "water to add" texture as a uniform to the simulation shader. The shader adds this water during its normal compute step.

## Changes

### 1. Create a persistent "water add" texture (`createWaterFlowSimulation`)

- Create a `DataTexture` (size × size, RGBA, Float) filled with zeros
- Expose it so `main.ts` can paint water into it on click

### 2. Add `waterToAdd` uniform to the simulation material

```ts
waterHeightVariable.material.uniforms.waterToAdd = { value: null };
```

### 3. Modify the simulation fragment shader

Add the uniform declaration and sample/add it to current water height:

```glsl
uniform sampler2D waterToAdd;
...
float addAmount = texture2D(waterToAdd, uv).r;
float newWaterHeight = currentWaterHeight + addAmount;
```

Then proceed with the existing flow simulation on `newWaterHeight`.

### 4. Rewrite `addWater` to paint into the add texture only

Instead of modifying `initialValueTexture`, paint water circles into the `waterToAdd` texture and set `needsUpdate = true`. The simulation shader consumes it on the next `gpuCompute.compute()` call.

After painting, the texture retains its values — but since we only add (not accumulate across frames in the add texture itself), we clear it after the simulation step. Actually, simpler: paint into it, simulation consumes and adds, then clear it back to zeros.

**Minimal approach**: Paint water into `waterToAdd`, let simulation consume it, then clear `waterToAdd` back to zeros immediately. This way only one frame of water is added per click.

### 5. Update `main.ts` click handler

- Pass the `waterToAdd` texture reference (or use the returned API)
- Remove the unused `waterAddTempTexture` field if present

## Files Modified

| File | Change |
|------|--------|
| `src/nodes/water/createWaterFlowSimulation.ts` | Add `waterToAdd` texture, uniform, shader modification, rewrite `addWater` |
| `src/main.ts` | Update click handler if needed |

## Implementation Order

1. Create `waterToAdd` DataTexture and add uniform
2. Modify shader to sample and add `waterToAdd`
3. Rewrite `addWater` to paint into `waterToAdd` and clear after
4. Update returned object to expose what `main.ts` needs
5. Run `npm run validate`