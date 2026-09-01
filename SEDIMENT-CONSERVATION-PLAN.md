# Sediment-Conserving Erosion & Deposition — Implementation Plan

Target shader: `src/shaders/compute/sediment-flow.frag` (currently a stub that writes
`vec4(0, 0, 0, 0)`; see commit `a228b3d "clear out erosion behavior"`, which deleted a
previous **non-conserving** implementation).

The surrounding scaffolding already exists: the `sedimentFlow` variable is created, wired
into the compute graph, round-tripped through save/load, exposed as
`TextureEnum.SedimentFlowMap`, and rendered by Testing Simulation mode
(`visualizationMode === 6`) via `src/shaders/testing-visualization.frag`. Most of the work
below is therefore **not** new plumbing — it is (a) a physically correct, mass-conserving
shader, and (b) fixing four places where the existing scaffolding prevents conservation.

---

## 1. Definition of "sediment conserving"

Let, per texel, `s` = suspended sediment load expressed in **bed-equivalent height units**
(same units as terrain height), and `b` = bed elevation stored in the dynamic height map.

**Invariant (per simulation step, ignoring explicit boundaries):**

```
Σ_cells ( s + b )  ==  constant        // up to float32 summation noise
```

Consequences that drive the design:

1. Sediment leaving cell _i_ must arrive at exactly one neighbour; export and import are
   two evaluations of the **same function on the same texel read**.
2. Erosion and deposition are a **paired local exchange**: `Δb = D − E` and
   `Δs_local = E − D`, computed in the _same_ shader invocation, so they cancel exactly.
3. Any clamp (`max(0, …)`, capacity caps, bedrock floors, boundary clipping) must be
   **mass-returning**: what a clamp removes has to be re-added to the other reservoir, never
   dropped.
4. Filters that are not written in flux form (blur / Laplacian smoothing) destroy the
   invariant and must go.

The previous implementation violated #2 and #4: `sediment-flow.frag` wrote an erosion/deposition
**rate** into alpha, and `terrain-height.frag` integrated it independently with its own scale
factor (`-rate * 0.02`) plus a 3×3 Laplacian blend at 0.3. Mass was minted and destroyed at the
bed interface, and smoothing moved height that nothing had subtracted.

---

## 2. Existing infrastructure inventory

| File                                                              | Current role                                                                                                                                                                                                             | Status for this work                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/shaders/compute/sediment-flow.frag`                          | Stub (`vec4(0,0,0,0)`)                                                                                                                                                                                                   | Rewrite (Phase 1–3)                                                                                            |
| `src/gpu/waterFlowSimulation/variables/createGpuSedimentFlow.ts`  | `addVariable("sedimentFlow", …)`, deps `[waterVelocity, sedimentFlow]`, custom uniforms `uVelocityMap` / `uHeightMap` / `surfaceMaterialMap` / `uHasSurfaceMaterialMap` / `baseErosionRate`; zero-filled initial texture | Deps + uniform wiring change (S1, S2), add `updateSedimentFlow` (S6)                                           |
| `src/gpu/waterFlowSimulation/variables/createGpuTerrainHeight.ts` | `addVariable("heightMap", …)`, deps `[sedimentFlow, heightMap]`, seeds from base displacement texture with `flipY = true`                                                                                                | Bed-integration change in shader; flip audit (S5)                                                              |
| `src/shaders/compute/terrain-height.frag`                         | Applies `-rate * 0.02`, then mixes 30% toward 3×3 neighbour mean                                                                                                                                                         | Rewrite to exact, flux-safe integration (S4)                                                                   |
| `src/gpu/waterFlowSimulation/createGpuWaterFlowSimulation.ts`     | Creates variables; passes `undefined` for sediment's & velocity's `heightMapVariable`, then re-calls `setVariableDependencies` for sediment and manually binds `sedimentUniforms.uHeightMap` after `init()`              | Single dependency declaration, wire dynamic bed into velocity (S2, S3), call `updateSedimentFlow` in `compute` |
| `src/gpu/waterFlowSimulation/variables/createGpuWaterVelocity.ts` | D8 downslope velocity; takes `heightMapVariable?` but is passed `undefined`, so it reads the **static base** bed                                                                                                         | Wire dynamic bed (S3) — conservation-relevant, see §4.3                                                        |
| `src/shaders/compute/water-velocity.frag`                         | Writes `vec4(vx, vy,                                                                                                                                                                                                     | v                                                                                                              | , 1)`; early-out `vec4(0,0,0,1)` when depth < 0.01 | Unchanged (it is our routing source of truth) |
| `src/renderer/systems/simulation.ts`                              | Pokes `sedimentUniforms.baseErosionRate.value = world.erosionRate` each frame; calls `waterSimulation.compute(dt, gameTime)`                                                                                             | Replace poke with `updateSedimentFlow(...)` (S6)                                                               |
| `src/gpu/waterFlowSimulation/saveLoadSimulationState.ts`          | Reads/writes all four channels of the sediment RT and height RT as raw `Float32Array`                                                                                                                                    | Works unchanged; semantics note in S7                                                                          |
| `tests/TESTING.md`, `tests/test-gpu-water-sources.*`              | Playwright → HTML page → client script pattern for GPU tests                                                                                                                                                             | Template for new `test-gpu-sediment-flow.*` (S8)                                                               |
| `src/gpu/README.md`                                               | Variable table + dataflow diagram, sediment missing                                                                                                                                                                      | Update graph/table (S9)                                                                                        |

Facts about `GPUComputationRenderer` (verified in
`node_modules/three/examples/jsm/misc/GPUComputationRenderer.js`) that constrain the design:

- `init()` injects, for **every declared dependency**, a uniform named _exactly_ after the
  variable (`uniforms[depVar.name] = { value: null }`) and **prepends**
  `uniform sampler2D <name>;` to the fragment shader. Declaring your own duplicate declaration
  of `sedimentFlow` / `waterVelocity` / `heightMap` / `waterHeight` is a compile error.
- `compute()` binds each dependency uniform to `renderTargets[currentTextureIndex]`, so every
  cross-variable read is the **last committed frame** (one-step lag). Variables are stepped in
  insertion order; there is no topological sort and no cycle detection, so the current
  `sedimentFlow ⇄ heightMap` cycle is tolerated and resolves to stale reads. Do not rely on
  same-frame coupling between two variables.
- Render targets are `FloatType` RGBA (32-bit float), nearest-filtered, clamped. Good: no
  half-float precision cliff for the conservation sum; no filtering accidents in flux math.
- No image load/store, no atomics, single writer per texel: **scatter** export is impossible, so
  inter-cell transfer must be expressed as gather with a symmetric predicate (the trick already
  used by `water-height.frag` for inflow/outflow).

---

## 3. Scaffolding changes required

### S1 — Stop pinning ping-pong buffers with one-time custom-uniform binds _(blocking)_

`initSedimentFlow()` and the post-`init()` block in `createGpuWaterFlowSimulation.ts` assign
custom uniforms once:

```ts
uniforms.uVelocityMap = {
  value: gpuCompute.getCurrentRenderTarget(waterVelocityVariable).texture,
};
sedimentUniforms.uHeightMap = {
  value: gpuCompute.getCurrentRenderTarget(heightMapVariable).texture,
};
```

Right after `init()`, `currentTextureIndex === 0`, so these capture **physical buffer 0 forever**.
`compute()` alternates which physical buffer it writes, so the shader's view of its inputs
alternates between last-frame data and one-or-more-frames-stale data depending on pass order — the
sim is non-deterministic in a way that will make conservation debugging impossible.

**Fix (preferred): use the injected dependency samplers.** Declare the variables you read as
dependencies and sample them under their variable names (`waterVelocity`, `heightMap`,
`waterHeight`, `sedimentFlow`). Then delete the custom uniforms, their declarations in the `.frag`,
and the manual binding lines. Always exactly one committed frame of lag, no hazard, less code.

**Fix (fallback), only where a dependency cannot be declared:** rebind inside a per-frame
`update*()` function, which is what `updateWaterHeight` already does for `waterSourcesMap`. Note
that the same pinning currently affects `createGpuWaterVelocity.initWaterVelocity` and
`cloudShadowMap` in water height; leave those alone unless they block us (scope control) but record
them here so a future pass fixes them the same way.

Cost of the preferred fix: each declared dependency costs one always-bound sampler. Keep custom
uniforms for **parameters only**.

### S2 — Declare dependencies once, in the right place

`createGpuSedimentFlow` currently accepts `heightMapVariable?`, builds a conditional dep list, is
called with `undefined` from `createGpuWaterFlowSimulation.ts`, and then gets its dependency array
overwritten by a second `setVariableDependencies(sedimentFlowVariable, [...])` call plus a manual
uniform patch.

Change to a single authoritative declaration inside the factory:

```ts
const createGpuSedimentFlow = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  waterVelocityVariable: Variable,
  waterHeightVariable: Variable,
  heightMapVariable: Variable,
  surfaceMaterialMap?: THREE.Texture | null,
  savedTexture?: THREE.DataTexture,
) => { ... };

gpuCompute.setVariableDependencies(sedimentFlowVariable, [
  waterVelocityVariable, // routing direction + speed (source of truth, §4.3)
  waterHeightVariable,   // flow depth -> transport capacity, settling
  heightMapVariable,     // bed elevation + erodible-soil availability (§4.6)
  sedimentFlowVariable,  // self: previous suspended load
]);
```

Consequences in `createGpuWaterFlowSimulation.ts`: create the terrain-height variable **before**
the sediment variable (or reorder afterwards without re-declaring), drop the second
`setVariableDependencies`, drop the manual `uHeightMap` patch, and pass the real variables instead
of `undefined`. The static `heightMapTexture` argument is no longer needed by this factory — remove
it (`knip` will flag dead parameters/exports if we leave them behind).

### S3 — Feed the incised bed back into flow _(conservation-relevant)_

`createGpuWaterVelocity` is called with `undefined // heightMapVariable (will be set later)`, and
nothing sets it later, so water velocity is computed from the **static base terrain** while
sediment will be routed by that velocity. If sediment ever needed its own D8 on the _dynamic_ bed,
export/import predicates would disagree with reality and channels would cut incoherently.

Change: pass `heightMapVariable` into `createGpuWaterVelocity` (parameter already exists) so
`water-velocity.frag` samples the dynamic bed — **using the injected `heightMap` dependency sampler**,
not a pinned custom uniform (S1). Because sediment routing derives from that single velocity field,
export and import stay consistent by construction (§4.3).

Note the one-frame lag this introduces into the loop
`heightMap → waterVelocity → sedimentFlow → heightMap`: it is a feature — it keeps each step's
exchange pairs self-consistent instead of half-updated.

### S4 — `terrain-height.frag` becomes a pure, exact bed integrator

- Apply the signed bed delta channel produced by sediment flow with **no rescale**:
  `newBed = bed + bedDelta`. All rate/scale/damping logic belongs to `sediment-flow.frag`, so mass
  removed from / returned to the bed is defined in exactly one place.
- **Delete** the 3×3 Laplacian smoothing block (`mix(newHeight, neighborAvg, 0.3)`). It is not a
  flux term: it manufactures and annihilates height and breaks `Σ(s + b)`. If smoothing is needed
  for visual reasons, re-add it later as an explicitly conservative diffusion in the sediment shader
  (subtract own diffusive flux, add each neighbour's identically-computed flux), or as talus-angle
  creep written as pairwise transfer (§7).
- Do **not** clamp here except as a hard floor at bedrock elevation; availability limiting must
  happen at the erosion site so over-erosion never occurs (a clamp here would be an unaccounted
  sink — if we ever see it bite, that is a bug in Phase 2 limiting).

### S5 — Coordinate-system / `flipY` audit _(blocking for coupled visuals)_

Initial-value textures disagree on orientation: `createGpuTerrainHeight.ts` sets
`texture.flipY = true`, and the base displacement texture does too
(`src/scene/resources/textures/displacement.ts`), while water, velocity and sediment seeds leave
`flipY` at three's `DataTexture` default (`false`, verified in
`node_modules/three/src/textures/DataTexture.js`). Initial textures are blitted into render targets
by `renderTexture()`, so orientation does propagate. Before erosion starts carving, add a probe test
(S8, "seed orientation") that writes an off-centre marker into the bed and into sediment load, then
asserts both land at the same world UV. Reconcile in one direction (most likely: drop `flipY` on the
terrain seed and sample the base texture consistently) and note any interaction with
`updateTerrainGeometryFromRenderTarget`, whose comments currently assert "no Y flip needed".

### S6 — Per-frame parameter updates, replacing ad-hoc uniform pokes

Add to `createGpuSedimentFlow`'s return value (pattern parity with `updateWaterHeight`):

```ts
export type SedimentFlowUniforms = {
  surfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  erosionCoefficient: THREE.IUniform<number>; // world.erosionRate slider drives this
  capacityExponent: THREE.IUniform<number>;
  criticalSpeed: THREE.IUniform<number>;
  detachRate: THREE.IUniform<number>;
  settleRate: THREE.IUniform<number>;
  transferCap: THREE.IUniform<number>; // <= 1, stability + mass safety knob
  dtScale: THREE.IUniform<number>;
};

const updateSedimentFlow = (deltaTime: number): void => { ... };
```

`createGpuWaterFlowSimulation.compute()` calls it alongside `updateClouds` / `updateWaterHeight`.
`src/renderer/systems/simulation.ts` then stops reaching into the variable's material directly and
just forwards `world.erosionRate`; keep that wiring so the existing UI slider keeps working.

Frame-rate coupling: `compute(_deltaTime)` currently ignores dt and every coefficient in this codebase
is per-frame. Keep coefficients per-frame for consistency, but set
`dtScale = clamp(dt / (1/60), 0.25, 2.0)` so a stalled frame cannot export more than the cap allows.

### S7 — Save/load semantics stay valid, with one caveat

`saveLoadSimulationState.ts` copies all four channels of both the sediment and height render
targets, so no structural change is needed. Caveat: the alpha channel changes meaning from
"erosion/deposition **rate**" to "signed bed delta applied in the step that produced this texture".
On load, a stale transient delta would be re-applied once by `terrain-height.frag` if sediment and
bed are restored from snapshots of different steps. Save/load already captures both RTs together;
add a regression test asserting "save → recreate → save" is byte-stable while paused (S8).

### S8 — Tests (mandatory per AGENTS.md)

New Playwright GPU suite following `tests/TESTING.md` (`test-gpu-sediment-flow.ts` +
`.html` + `.test.ts`, modelled on `test-gpu-water-sources.*`). Read results with
`renderer.readRenderTargetPixels` and sum in JS with **double-precision / Kahan** accumulation —
tolerances must reflect that the shader is float32 but the checker should not be.

The harness needs a tiny local helper (in the test file, not `src/`, to keep `knip` happy) that
builds a standalone `GPUComputationRenderer` with the sediment variable plus synthetic
`waterVelocity` / `waterHeight` / `heightMap` inputs of our choosing — i.e. a controllable mini-graph,
not the full 512² simulation.

Assertions:

| Test                                | Invariant                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `closed basin conserves total mass` | cone/flat terrain + water inflow; run 300 steps; `\|ΔΣ(s+b)\| / Σ < 1e-4` and no NaN/Inf anywhere |
| `single hop symmetry`               | one cell of load with known velocity: exported == neighbour's imported, to float epsilon          |
| `erosion is mass-neutral`           | uniform slope + water: bed loss equals suspended gain exactly per step                            |
| `deposition is mass-neutral`        | fan into a standing-water pit: load loss equals bed gain                                          |
| `no leak at domain border`          | load driven off-grid stays inside the grid; total unchanged                                       |
| `erosion limited by availability`   | soil exhausted → bed stops lowering, no new load created                                          |
| `clamps return mass`                | absurd settle/detach rates: still conserved (catches silent `max(0, …)` sinks)                    |
| `zero water = deposit in place`     | velocity zero everywhere → nothing vanishes                                                       |
| `deterministic replay`              | identical seeds produce identical textures (guards S1-style buffer pinning)                       |
| `seed orientation`                  | bed marker and sediment marker land at matching UVs (S5)                                          |

Plus a CPU reference model in `tests/unit/sedimentConservation.test.ts` (`@playwright/test`, like
`tests/unit/terrainHeightSampler.test.ts`) implementing the same math in plain typed arrays; assert
GPU output matches it on a 16×16 fixture. The reference model is also where the tuning of
coefficients happens cheaply, and it documents the algorithm independently of GLSL.

Note: `tests/test-shaders.ts` globs only `src/shaders/*.frag|*.vert`, so compute shaders are not
compile-checked by it — do not assume the new shader is covered there; extend the glob to
`src/shaders/**/*.frag` **only if** every nested file has a matching vertex shader, otherwise keep
the dedicated GPU test as the compile check.

### S9 — Documentation and visualization bookkeeping

- `src/gpu/README.md`: add `heightMap` (dynamic bed) and `sedimentFlow` rows to the variable table
  and extend the dataflow diagram:
  `Clouds, Sources → WaterHeight → WaterVelocity ⇄ HeightMap → SedimentFlow → HeightMap`.
- `src/shaders/testing-visualization.frag`: alpha is now a **signed bed delta** (deposition positive,
  erosion negative) rather than "rate"; the red/blue overlay signs flip accordingly. Keep B = load so
  existing orange-plume reading still means something; direction stays in RG. Optionally normalize by
  `uniform float uDeltaScale` instead of the hard-coded `* 5.0`.
- New tunables (Phase 4, optional): sliders next to the existing Erosion slider in
  `src/ui/GameUI.tsx`, backed by fields in `createGameWorldContext()` (`src/context.ts`).

---

## 4. The algorithm

### 4.1 Texel layout for `sedimentFlow` (RGBA32F)

| Channel | Meaning                                                           | Units                 | Consumed by                |
| ------- | ----------------------------------------------------------------- | --------------------- | -------------------------- |
| R, G    | unit sediment transport direction                                 | –                     | TestingSimulation viz only |
| B       | suspended load `s`                                                | bed-equivalent height | self (next step), viz      |
| A       | signed bed delta of this step `Δb = D − E` (+ deposit, − erosion) | height                | `terrain-height.frag`      |

Units are chosen so the exchange needs no conversion factor: eroding one unit of bed adds exactly
one unit to `s`. Keep direction in RG even though it is derivable — it costs nothing and preserves
the existing debug view's meaning.

### 4.2 Step outline (single pass, per texel)

```glsl
#include <common>   // dependency samplers waterVelocity / waterHeight / heightMap / sedimentFlow are injected by GPUComputationRenderer

uniform sampler2D surfaceMaterialMap;
uniform float erosionCoefficient;
uniform float capacityExponent;
uniform float criticalSpeed;
uniform float detachRate;
uniform float settleRate;
uniform float transferCap;
uniform float dtScale;

void main() { ... }
```

1. Read `bed = heightMap(uv).r`, depth `d = waterHeight(uv).r`, velocity from
   `waterVelocity(uv)` (`rg` = dir × speed, `b` = |v|), previous load `sPrev = sedimentFlow(uv).b`.
2. **Hydraulic quantities.** Speed `u = length(v.rg)`. Bed slope by central difference on the bed
   field: `S = length(vec2(dHdx, dHdy))` from `heightMap` taps at ±`cellSize`. Shear proxy
   `tau = u * u * (1.0 + slopeGain * S)`; mobility is zero where `d < wetThreshold`.
3. **Material factors** from `surfaceMaterialMap` exactly as the deleted version did — erodibility
   `{bareDirt 1.0, grass 0.3, rock 0.1}` (roots bind soil, rock resists) and deposition factor
   `{bareDirt 1.0, grass 1.5, rock 0.8}` (vegetation traps sediment). Keep the
   `uHasSurfaceMaterialMap` guard only if the map can legitimately be absent; otherwise drop it
   (`createSimulationResource` always supplies one).
4. **Transport capacity** — superlinear in speed so channels self-organise and deltas build:
   `C = erosionCoefficient * pow(max(u - criticalSpeed, 0) / max(u, eps), capacityExponent) * d * erodibility`,
   clamped above by a fixed ceiling (a cap on _how much can be carried_ is mass-safe; it only limits
   new erosion). `capacityExponent` default ≈ 1.5.
5. **Exchange at the bed** (paired, availability-limited):
   - available erodible material `soilAvail` (§4.6)
   - `E = min(soilAvail, detachRate * max(tau - tauCrit, 0.0), max(C - sPrev, 0.0)) * dtScale`
     — never erode what the flow cannot carry: this is what keeps cliffs from exploding.
   - `D = min(sPrev + E, settleRate * max(sPrev + E - C, 0.0) * depositionFactor * stillWaterBoost)`
     — clamped by actual load so deposition can never create bed out of nothing; the surplus simply
     stays in suspension (mass-returning clamp).
   - `bedDelta = D - E`, `sLocal = sPrev + E - D` (≥ 0 by construction, no silent clamp needed).
6. **Routing fraction.** `phi = min(transferCap, u / (u + advectHalfSpeed)) * dtScale`, clamped to
   `[0, transferCap]` with `transferCap <= 1`. Outflux `f = sLocal * phi`. Export only if the target
   texel is inside the grid; at borders keep the load in place (documented boundary retention — an
   explicit alternative would be a "sediment sink" counter, but silent leak is not acceptable).
7. **Conservative gather** (§4.3) yields `fIn`; final load `sNew = sLocal - f + fIn`.
8. Write `vec4(dirX, dirY, max(sNew, 0.0), bedDelta)` — with a debug branch that asserts the residual
   `sNew - (sPrev + E - D) + ...` is zero; in practice assert via tests rather than shader cost.

### 4.3 Why routing conserves mass

No atomics ⇒ we cannot push into neighbours. Instead: **both sides evaluate the same function on the
same texel read**, which is exactly how `water-height.frag` pairs outflow with inflow.

- Route target for a cell is derived from `waterVelocity.rg` by snapping to the nearest of the eight
  canonical directions — the velocity shader _only ever_ emits one of those eight unit vectors times a
  magnitude, so this round-trip is exact (dot-product argmax; no `atan2`, no angle wrap ambiguity).
- Own export uses `fluxAt(uv)`. Inflow loops the eight neighbours `n` and adds `fluxAt(uv_n)` **iff**
  `routeIndexOf(uv_n) == opposite(i)`. Both terms read neighbour _i_'s velocity texel once, so
  export subtracted at cell _j_ and import added at cell _i_ are the same float expression on the same
  input. Sum over all cells of `(−f + fIn)` therefore telescopes to zero except for border flux (§4.2
  step 6) — this is the property the "single hop symmetry" test pins down.
- Implement `fluxAt` as **one pure helper** used by both paths. Never recompute capacity/erosion per
  neighbour: not only O(8×) more work, it invites divergence between export and import.
- Snapping to velocity (rather than re-running D8 on the bed inside this shader) is what makes S3 a
  prerequisite: if velocity came from the static base bed while routing predicates used the incised
  bed, the two would disagree about where water goes — visually obvious as channels cutting where no
  water flows.

Cost per texel: ~8 velocity taps + ~4 bed taps + 1 material tap (vs. 64+ taps for a nested-D8
version). At 512² that is comfortably one pass; if we later need sub-stepping, prefer raising
`transferCap` discipline over multi-pass machinery (`GPUComputationRenderer.compute()` has no
per-variable repeat — a manual second `doRenderTarget` pass on the same material would read/write the
same buffer and needs an explicit ping-pong helper).

### 4.4 Stability rules

- `phi ≤ transferCap ≤ 1`: explicit advective CFL analogue; mass export can never exceed inventory.
- Capacity ceiling + `min(soilAvail, …)` keep erosion bounded even with absurd slider values (the UI
  allows `erosionRate` up to whatever the slider permits).
- All coefficients multiplied by a single `dtScale` that is clamped on both ends (§S6).
- No division without a guard: every normalize/divide uses `max(x, eps)`; NaN in one texel otherwise
  propagates through the bed permanently.
- Keep `sNew ≥ 0` structurally (via §4.2 step 5), not via a trailing clamp that would hide leaks.

### 4.5 Water coupling caveats

The water field is **not** conserved (cloud deposition, sources, infiltration/drainage in
`water-height.frag`). Sediment riding on water that later disappears must not vanish with it: when
depth drops below `wetThreshold`, capacity → 0 and settling boosts, so load deposits _in place_
rather than being deleted. Do **not** scale load by depth — that would be a hidden sink the tests
would catch as unaccounted loss.

### 4.6 Optional Phase 3: erodible soil over bedrock

Unbounded erosion lets a river cut to −∞. The dynamic height map has unused channels
(`terrain-height.frag` currently writes `vec4(smoothedHeight, 0, 0, 1)`): use `.g` = remaining
erodible regolith thickness, `.b` = immovable bedrock elevation (`baseBed - regolith`). Then
`soilAvail = heightMap(uv).g`, erosion decrements it in the same shader that writes `bedDelta`, and
`terrain-height.frag` moves material from regolith to suspended load — total _material_ stays
conserved across layers while bedrock becomes an impenetrable floor. Requires seeding `.g`/`.b` in
`createInitialTerrainHeightTexture` (currently only `.r`) — and save/load already carries all four
channels. Deferred deliberately: it is the biggest change to bed semantics, and Phase 2 must be green
first.

---

## 5. Alternatives considered

| Option                                                             | Verdict                                                                                                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep rate-in-alpha + independent bed integration (status quo ante) | Rejected: mass minted/destroyed at the bed interface; cannot pass `erosion is mass-neutral`.                                                                                                  |
| Scatter advection with atomics / image store                       | Not expressible in WebGL2 GLSL1 fragment shaders used by GCR.                                                                                                                                 |
| Nested D8 recomputation for inflow (mirrors `water-height.frag`)   | Correct but 64+ taps and duplicates the routing predicate; velocity-snapping is cheaper and provably consistent. Revisit only if we ever want sediment to follow a path different from water. |
| CPU readback + JS accumulation                                     | 512² readbacks each frame are already the bottleneck in `updateTerrainGeometryFromRenderTarget`; adding more would regress frame time.                                                        |
| Stratigraphic layer stack (full 3D column model)                   | Out of scope; §4.6 gives most of the visual/physical benefit at a fraction of the cost.                                                                                                       |

---

## 6. Phased delivery

Each phase ends with `npm run validate` **run via a subagent** (mandatory per AGENTS.md), plus
`npm run knip` and `npm run format` before commit; keep commits conventional and single-purpose.

| Phase                           | Content                                                                                                              | Files                                                                             | Exit criteria                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Harness & scaffolding       | S1, S2 (deps without new sampling), S5 audit, test scaffold + CPU reference model with pure-diffusion advection only | `createGpuSedimentFlow.ts`, `createGpuWaterFlowSimulation.ts`, new tests          | `closed basin`, `deterministic replay`, `seed orientation` pass; app renders unchanged (shader still writes zeros or pure advection)   |
| 1 — Conservative transport      | §4.2 steps 1–7 with `E = D = 0`; advect a seeded load                                                                | `sediment-flow.frag`                                                              | `single hop symmetry`, `no leak at domain border`, `zero water` pass; total load conserved to 1e-4 over 300 steps                      |
| 2 — Erosion/deposition pairing  | §4.2 step 5, S4 bed integration, S3 dynamic-bed→velocity wiring                                                      | `sediment-flow.frag`, `terrain-height.frag`, `createGpuWaterVelocity.ts`          | `erosion is mass-neutral`, `deposition is mass-neutral`, `clamps return mass` pass; visible channels + deltas without net height drift |
| 3 — Materials, limits, feedback | material erodibility/deposition factors, wet threshold, optional §4.6 layers                                         | `sediment-flow.frag`, maybe `createGpuTerrainHeight.ts`                           | `erosion limited by availability` passes; painting grass visibly stabilises banks in a scripted run                                    |
| 4 — Tuning & debug UX           | S6 uniforms wired to world state/UI, S9 viz + docs, `uDeltaScale` in debug view                                      | `simulation.ts`, `context.ts`, `GameUI.tsx`, `testing-visualization.frag`, README | Sliders behave; conservation probe exposed to tests/debug only (no dead exports for `knip`)                                            |

---

## 7. Known follow-ups (explicitly out of scope)

- Talus-angle / mass-wasting creep, written as pairwise bed-to-bed transfer so it stays conservative:
  `q = creepRate * max(slope - talusSlope, 0)` moved from the steep cell to the lower neighbour with a
  symmetric predicate. This is the honest replacement for the smoothing removed in S4 if slopes get
  too jagged.
- Same S1 treatment for the remaining pinned uniforms (`uWaterHeightmap`, `cloudShadowMap`).
- Replacing the per-frame CPU readback in `updateTerrainGeometryFromRenderTarget` (a fresh
  `Float32Array(512*512*4)` every frame) — adjacent to this work since Phase 2 makes bed evolution
  visible, but a separate performance change.

---

## 8. Addendum A — binding implementation decisions

Written before implementation to remove ambiguities that would otherwise be resolved
differently by different people/phases. Where this section narrows or corrects §3–§4, **this
section wins**; deviations from the original text are called out explicitly.

### A1 — Texel layout (unchanged from §4.1)

`R,G` unit transport direction · `B` suspended load `s` (bed-equivalent height units) ·
`A` signed bed delta `Δb = D − E` **scheduled** for the bed, applied by `terrain-height.frag`
on the next committed step.

### A2 — Availability without channel layers (§4.6 replaced, not deferred)

Bedrock is derived from the **static base displacement texture**, sampled through a custom
uniform `uBaseHeightMap`, instead of living in `heightMap.g/.b`:

```
bedrock      = uBaseHeightMap(uv).r - erodibleDepth
effBed       = heightMap(uv).r + sedimentFlow(uv).a          // bed once the pending delta lands
availableSoil = max(effBed - bedrock, 0.0)
```

Reasons: no new seed channels to populate (so save/load semantics and legacy saves are
untouched), the floor is genuinely immovable (constant across frames), and availability needs
one extra texture tap. `uBaseHeightMap` is a static DataTexture that never ping-pongs, so the
S1 pinning hazard does not apply to it.

**Why `effBed` and not plain bed**: the bed integrates with a one-step lag (§S2/S4), so limiting
against `bed` alone lets two consecutive max-rate erosions overshoot the floor by up to two
steps of erosion (demonstrable with `E = available`, `D = 0`). `effBed` is exactly the value
`terrain-height.frag` is about to write, so limiting against it makes the floor unreachable from
above without any clamp.

### A3 — Per-texel evaluation order (transport **before** local exchange)

```
sPrev   = sedimentFlow(uv).b                                  // read raw, never clamped
outflux = outfluxAt(uv)                                       // §A4; depends on sPrev + velocity only
remaining = sPrev - outflux                                   // >= 0 because phi <= transferCap <= 1
capacity  compared against `remaining`
E = min(availableSoil, dtScale * min(detachRate * erodibility * max(tau - tauCrit, 0),
                                     max(capacity - remaining, 0.0)))   // availability applied AFTER dtScale
carried = remaining + E
D = min(carried, dtScale * settleRate * depositionFactor * max(carried - capacity, 0) * stillWaterBoost)
bedDelta = D - E
sNew     = carried - D + influx                               // >= 0 structurally: no trailing clamp
```

Deviation from §4.2 steps 5–7 (which export `sLocal * phi`, i.e. load _including_ this step's
erosion): exporting only what was already suspended keeps the flux helper a function of two
taps, so it can be evaluated for all nine texels without recomputing erosion/capacity per
neighbour (§4.3 asks for both properties at once; they conflict otherwise). Consequence: newly
eroded material becomes transportable on the next step — one-step lag, no mass consequence, and
it is what makes `sNew >= 0` structural instead of clamp-enforced.

### A4 — Routing predicate (single helper, symmetric)

`water-velocity.frag` emits exactly one of eight canonical unit vectors times a magnitude (or
zero), so snapping is exact: `route = argmax_i dot(dir, DIRECTIONS[i])` over the same direction
table used by `water-velocity.frag` / `water-height.frag` (`N, NE, E, SE, S, SW, W, NW`), no
`atan2`. `outfluxAt(p)` returns `sPrev(p) * phi(u(p))`, or **0 when the route target is outside
the grid** (documented border retention: a cell that would export off-grid keeps its load, so
neighbours never import from beyond the edge either). Inflow loops the eight neighbours at
direction `i` and adds `outfluxAt(uv_n)` iff `route(uv_n) == (i < 4 ? i + 4 : i - 4)`. Both sides
read the neighbour's velocity texel once through **one** helper (`float outfluxAt(vec2 p, out int route)`).

### A5–A7 — Hydraulic terms and constants

- `u = length(waterVelocity.rg)`, `dir = waterVelocity.rg / max(u, EPS)`;
  `slopeDrop = max(bed - heightMap(uv + dir * cellSize).r, 0.0)` (`dir == 0` → own texel → 0);
  `tau = u * u * (1.0 + SLOPE_GAIN * slopeDrop)`, `SLOPE_GAIN = 20.0`, `tauCrit = criticalSpeed²`.
  Deviation from §4.2 step 2: no central-difference bed slope — the D8 velocity already encodes
  the bed gradient, and a central difference would need ~36 extra taps once `outfluxAt` runs for
  nine texels. `wet = step(WET_THRESHOLD, depth)`, `WET_THRESHOLD = 0.01` matches the early-out in
  `water-velocity.frag`, so dry cells carry nothing and settle everything (§4.5).
- `speedFactor = pow(max(u - criticalSpeed, 0.0) / max(u, EPS), capacityExponent) * wet`;
  `capacity = min(CAPACITY_CEILING, erosionCoefficient * speedFactor * depth * erodibility)`,
  `CAPACITY_CEILING = 0.25` (a ceiling on _carriable_ load is mass-safe, §4.2 step 4).
- `phi = clamp(min(transferCap, u / (u + ADVECT_HALF_SPEED)) * dtScale, 0.0, transferCap)`,
  `ADVECT_HALF_SPEED = 0.1`. Every divide guarded by `max(x, EPS)`, `EPS = 1e-7`.

### A8 — Uniform set (`createGpuSedimentFlow`)

Textures: `uBaseHeightMap` (static base displacement), `surfaceMaterialMap`.
Params + defaults: `erosionCoefficient 0.01` (driven by `world.erosionRate`),
`capacityExponent 1.5`, `criticalSpeed 0.02`, `detachRate 0.004`, `settleRate 0.06`,
`transferCap 0.5`, `erodibleDepth 0.35`, `dtScale = clamp(dt * 60, 0.25, 2.0)`.
Deleted: `uVelocityMap`, `uHeightMap`, `uHasSurfaceMaterialMap`, `baseErosionRate`. When no
surface material map is supplied, bind a module-private 1×1 all-dirt `DataTexture` so the sampler
is never null — this is what allows dropping `uHasSurfaceMaterialMap` (§S2 preference).

### A9 — Material factors (as deleted)

erodibility `{dirt 1.0, grass 0.3, rock 0.1}`, depositionFactor `{dirt 1.0, grass 1.5, rock 0.8}`,
keyed off `surfaceMaterialMap.r` with `< 0.5` / `< 1.5` thresholds (same convention as
`water-velocity.frag`).

### A10 — `terrain-height.frag` becomes exact

```glsl
gl_FragColor = vec4(texture2D(heightMap, uv).r + texture2D(sedimentFlow, uv).a, 0.0, 0.0, 1.0);
```

No rescale, no Laplacian blend, no clamp (§S4).

### A11 — Velocity reads the dynamic bed; scope note

`water-velocity.frag` samples the injected `heightMap` dependency sampler for terrain (S3) and
keeps its existing pinned `uWaterHeightmap` untouched: §7 records that uniform for a separate
pass. `createGpuWaterVelocity` therefore takes `heightMapVariable` as a required parameter, and
its `heightMapTexture` fallback parameter goes away with it.

### A12 — Declaring the bed ⇄ sediment cycle once

`GPUComputationRenderer` needs both `Variable`s to exist before either dependency list can name
the other, so: create the bed variable (self-dependency only) → velocity (`[waterHeight, heightMap]`)
→ sediment (its single authoritative list `[waterVelocity, waterHeight, heightMap, self]`, set
inside its factory) → one explicit orchestrator line `linkSedimentFlow(sedimentFlowVariable)`
returned by `createGpuTerrainHeight` sets the bed's `[sedimentFlow, heightMap]`. Compute order is
irrelevant for values (every cross-variable read binds `renderTargets[currentTextureIndex]`, i.e.
the last committed frame), so this ordering only satisfies declaration.

### A13 — What "conserved" means with a one-step bed lag

Per pass: `S_{k+1} = S_k − ΣA_{k+1}` (flux telescopes to zero with border retention) and
`B_{k+1} = B_k + ΣA_k`, hence **`M* = Σ(s + bed + A)` is invariant exactly**, while `Σ(s + bed)`
drifts by at most one step of exchange. Tests report drift relative to cumulative exchanged mass
(`Σ_steps Σ|A|`) with a 1e-4 relative tolerance, plus exact-M* and NaN/Inf checks; JS sums use
Kahan/double accumulation (§S8).

### A14 — GPU test harness shape

Mini-graph per §S8: synthetic _identity_ variables named exactly `waterVelocity` / `waterHeight`
(`setVariableDependencies(v, [v])` plus a copy shader — GCR injects the self sampler), seeded from
fixtures; real `createGpuTerrainHeight` (fixture bed injected through its texture override) and
real `createGpuSedimentFlow`. Fixture `DataTexture`s use `flipY = false` so fixture index equals
texel index under `renderer.readRenderTargetPixels` (bottom-left origin, row-major).

### A15 — §S5 audit conclusion: keep `flipY = true` on the bed seed

The base displacement texture is uploaded with `flipY = true`, and `createInitialTerrainHeightTexture`
copies its raw data into a `flipY = true` seed as well, so after GCR's `renderTexture()` blit
`bedRT[y][x] == base[(N-1-y)*N + x]` — i.e. **sampling the static base map and reading the dynamic
bed RT agree at identical UVs**, which is exactly what S3 coherence and the mesh readback
("no Y flip needed") require. Dropping `flipY` on the bed seed would _break_ that agreement. The
probe test locks this mapping in rather than changing it; water/sediment seeds stay `flipY = false`
(their production seeds are uniform, so orientation is inert there).

### A16 — Explicitly not in this pass

§4.6 channel layers (superseded by A2), talus creep (§7), new UI sliders beyond forwarding the
existing Erosion slider (`world.erosionRate` → `erosionCoefficient`), remaining pinned uniforms
(`terrainHeightmap`, `uWaterHeightmap`, `cloudShadowMap`), and the per-frame geometry readback
allocation.

### A17 — Delivery order (one subagent per step, validation gate after each)

| Step | Content                                                                                                                             | Exit                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | Scaffolding: A8/A11/A12 uniforms + deps + `updateSedimentFlow`/`setErosionRate`, shader declares the new set and still writes zeros | typecheck+lint green, app page loads unchanged |
| 2    | Conservative transport (§4.2 steps 1–7, `E = D = 0`) + A10 bed integrator                                                           | no NaN/Inf, deterministic replay holds         |
| 3    | Erosion/deposition pairing with A2/A3/A5–A7                                                                                         | `M*` conserved, floor never crossed            |
| 4    | Material factors (A9)                                                                                                               | grass stabilises banks; still conserved        |
| 5    | CPU reference model + `tests/unit/sedimentConservation.test.ts`                                                                     | invariants pass on the reference model         |
| 6    | GPU Playwright suite `tests/test-gpu-sediment-flow.*` incl. CPU/GPU parity                                                          | all §S8 rows green                             |
| 7    | Debug viz (`testing-visualization.frag`) + `src/gpu/README.md`                                                                      | docs match A1–A15                              |
