# Council Memo — 3D Terrain with Subsurface Strata

**Date:** 2026-10-03 · **Status:** Converged (Pass 1 only; Pass 2 not needed — no material dispute; see "Disputes")

## Question and scope

Design an implementation plan for a 3D terrain with depth-based material strata:
grass as a thin top layer, then dirt, then impermeable bedrock; erosion deepens
the cut and exposes deeper material; the map edge shows a geological
cross-section; water infiltrates as a visible plume; water perched on
impermeable rock creeps slowly downslope underground. Roster gave plans, not
code; no implementation was performed by advisors (read-only).

## Roster and passes

| Advisor | Role in council | Context | Passes run |
|---|---|---|---|
| `oracle` | fallback fill (no `council-*` profiles exist) | `fork` — context-aware | Pass 1 (run `807716fb`); no resume needed |
| `reviewer` | fallback fill | default profile context; **Pass 1 re-run as fresh-context fallback** (first run `ff207c8b` failed with no output) | Pass 1 retry (run `b0f79c68`) |

- Degraded-mode note: fewer than two `council-*` profiles existed; filled with `oracle` (forked) + `reviewer` per fallback rule.
- Pass 2 was **not** run: with only two advisors that independently converged, no disputed claim remained that was both decision-affecting and settleable by advisor evidence.
- Workflow runs: Pass 1 `e7adbe0c` (oracle completed, reviewer first attempt failed); retry workflow `4f0602fa` (completed). Missions `fe8f5071`, `0443ed06`.

## Recommendation (adopted plan)

A **CPU-authored strata table + minimal per-column GPU state**, with
**GPU vertex displacement** as a prerequisite.

### 1. Data model — table, not stacks

Author strata on CPU as a typed table mirroring the existing
`src/scene/resources/textures/surfaceMaterial.ts` pattern, e.g.:

- `grass/topsoil` — thickness ~0.05, high permeability, low erodibility (~0.3), not transportable
- `dirt` — thickness ~0.5 (tunable; see owner decisions), mildly permeable (~0.5), fully erodible
- `bedrock` — to column base, impermeable, low erodibility (~0.1)

New GPU variable `strataMap` (RGBA, 512² = `SIM_SIZE` in
`src/renderer/resources/simulation.ts`): R = remaining overburden thickness,
G = perched-water depth at the rock interface, B = saturated (wetted) depth,
A = cumulative cut depth pinned against `uBaseHeightMap` (DEM from
`src/scene/resources/textures/displacement.ts`).

**Rejected: 3D density texture.** GCR variables are strictly 2D RGBA render
targets (`GPUComputationRenderer.js`); a full per-column stack would need N
variables (~4 MB each) for no benefit with ≤3–6 layers.

Keep strata layers **separate from `SurfaceMaterialType`**: painted materials
(grass, forest, etc.) stay a surface *cover* concept; re-keying the existing
`MATERIAL_TYPE_IDS` shader tables would churn four shaders for no gain.

### 2. Erosion → exposure

- Replace `availableSoilAt()`'s `baseHeight − erodibleDepth` "bedrock proxy"
  (`src/shaders/compute/sediment-flow.frag:19,186-191`) with a real
  interface lookup: exposed layer = last table entry with
  `baseHeight − cutDepth` above its base; availability clamps at rock.
- Detachment keys off the **exposed layer's** erodibility, so bedrock erodes
  slowly and never below its base.
- Grass erodes to bare dirt without transport: grass mass never enters
  `suspendedLoad`, so the existing telescoping conservation invariant
  (`outfluxAt`/`granularOutfluxAt` symmetry; `tests/unit/sedimentConservation.test.ts`)
  stays intact.
- Erosion increments per-column cut depth only; surface color, permeability,
  and erodibility all derive from the table via depth — that is what makes
  requirements 2/3 fall out almost for free.

### 3. Border cross-section

New `src/scene/resources/meshes/strataCrossSection.ts`: four ribbons (or one
ring channel) hugging the terrain edges; V coordinate = depth from the current
surface; fragment shader walks the strata table by depth and paints that
material's color; show darkened/wet tint where depth < saturated depth.
Ribbon tops must track the *current* (eroded) surface height or the
cross-section sits behind/below the mesh. Register new `MeshEnum` keys; do not
share geometry with `terrainGeometryState.ts`/wireframe overlay.

### 4. Percolation and perched flow — GPU

New GCR variable `subsurfaceFlow` depending on itself, `heightMap`,
`waterHeight`, and strata uniforms. Infiltration subtracts from `waterHeight`
by the exposed layer's permeability; where a layer above an impermeable one
saturates, route perched water along the **static** rock-top elevation
(`baseHeight − soilThickness`) — do not let painted edits
(`terrainEditMap`) move the interface. A plume = the saturated-depth channel,
sampled by the surface shader to darken moist strata.

### 5. Material identity on the surface

Terrain currently renders with `MaterialEnum.Default` — a plain brown
`MeshPhongMaterial` (`src/world/factories/terrain.ts:23`,
`src/scene/resources/materials/default.ts`); no shader shows strata yet. Add
`MaterialEnum.Strata` with a `ShaderMaterial` (typed-uniform interface per
AGENTS.md) sampling `strataMap` + the CPU table; bind render targets in
`renderer/systems/simulation.ts` and the `storage.ts` load path; extend
`SavedSimulationTextures` (both new variables must be serialized or state
silently won't survive load — `createGpuWaterFlowSimulation.ts`
`getAllVariables`).

### Prerequisite: mesh displacement

The terrain geometry is built **once on CPU** from the static DEM
(`src/scene/resources/meshes/terrain.ts`, 160² segments) while simulation runs
at 512². **Until terrain height samples the live height/strata texture in a
vertex shader, erosion is invisible on the mesh and most of this feature is
cosmetic.** Both advisors flagged this; it is the first task, not the last.

### Phasing

- **A.** CPU strata table + `strata`/`strataMap` variable + depth-based surface material (shader path)
- **B.** Erosion → exposure (retire/scope the `terrain-quality`/organic-deposit path; extend `sediment-flow.frag` keeping conservation symmetry)
- **C.** Edge ribbons / cross-section
- **D.** Percolation + perched downslope flow
- **E.** Save/load extension, unit tests, `npm run validate` gating

## Accepted feedback

- Table + cumulative-depth model over full stacks or 3D density (both advisors, independently).
- Per-column state: 4 scalars per texel is sufficient; don't model layer-internal moisture beyond saturated depth.
- Keep painted `SurfaceMaterialType` and strata layers separate concerns.
- Perched flow must follow the *static* rock-top surface, not paint-editable height.
- Cross-section must be a depth-mapped ribbon that tracks the eroded surface.

## Rejected feedback (with reasons)

- **3D/stacked density textures** — rejected on GPUComputationRenderer architecture facts (2D-only variables) and negligible benefit at 3–6 layers.
- **CPU-side strata simulation** — rejected: a per-frame 512²×4 scan plus existing `readRenderTargetPixels` adds measurable frame cost; nothing in the repo does CPU grid simulation today.
- **(Both reports, minor error)** "Total relief is only ~1.8 world units" — **wrong**: `cobbsCreekHeightField.ts` shows measured relief −1.2 m…65.2 m with `heightScale: 10` ≈ 6.6 world units. Correct this in the task brief; it does not change the plan (strata thicknesses are authored values either way).

## Decision resolution (owner, 2026-10-03)

All seven owner decisions are now **resolved** — none remain open:

1. **RESOLVED — Mesh displacement: GPU.** The mesh must reflect eroded
   heights, so terrain rendering moves to a vertex shader sampling the live
   height/strata texture. The CPU `createTerrainGeometry` path in
   `src/scene/resources/meshes/terrain.ts` is superseded; the 160² mesh stays
   as the lower-resolution render grid over the 512² sim grid, but heights
   come from the texture.
2. **RESOLVED — Alluvium: yes.** Eroded material deposits as real layered
   alluvium in a column and *mutates the material type downslope* — a
   deposited cell's surface becomes the deposit's material. Implementation
   consequence: the per-column model must support **accretion as well as
   incision**. Extend the `strataMap` idea: R = remaining overburden above
   rock-top (can recover via deposition), A = cumulative cut depth below the
   original surface (deposition decrements it; never below 0), plus a
   surface-material channel for deposits — or a per-column thin surface-deposit
   layer whose type flows with the sediment type. Must preserve the
   `sediment-flow.frag` conservation contract: fluxes stay pure functions of
   the exporter's texel with bit-identical re-evaluation on import; no
   double-drawing the same material budget.
3. **RESOLVED — Grass regrows slowly.** Depth-derived exposure (cut depth) is
   the source of truth; regrowth walks the surface material back toward grass
   when that cell's cut depth is within the grass/topsoil layer. Painting
   still mutates the surface, but regrowth is depth-gated — you cannot paint
   grass back onto exposed bedrock.
4. **RESOLVED — Bedrock erodes, very slowly.** Bedrock gets a low nonzero
   erodibility (~0.1); column depth is capped so it never punches through to
   nothing (base level = `baseHeight − totalThickness`).
5. **RESOLVED — Groundwater discharges at the map edge and wherever water
   flows as a spring line.** Perched water routed along rock-top that reaches
   an outcrop or the map edge emits to the surface (a spring), rejoining
   surface flow. Where it exits, the surface there shows saturated/darkened
   material — a visible spring line.
6. **RESOLVED — Strata are the source of truth.** Surface material is just
   the top layer of the column; painting mutates the strata surface. The
   painted `SurfaceMaterialType` texture and `surfaceMaterial.ts` table get
   re-keyed as *surface-cover metadata* (e.g. `grass` = the thin organic
   cover on top of the soil layer; `rocks` = mapped-to-rock exposure), while
   depth-derived strata decides which material is exposed. Where they
   disagree, strata wins.
   **Clarified (parent):** the rendered surface MUST be driven by the 3D
   strata — the surface fragment shader samples the per-column strata state
   (`strataMap`) and picks the top-layer material from the CPU strata table
   by depth. Painting must NOT keep writing an independent surface-material
   texture; it mutates the strata source of truth instead: painting
   `rock` = set that column's exposure to rock-top (cut depth to rock);
   painting `grass` = set the column's top-layer to grass, allowed only
   while that column's surface is within the grass/topsoil depth; painting
   `dirt`/`alluvium` = set the top layer to dirt. The
   `surfaceMaterialMap` texture and `paintTerrain.ts`/`TerrainPaintingManager`
   paths are repointed at strata, not kept in parallel.
7. **RESOLVED — Existing visual style.** Schematic `MATERIAL_PROPERTIES`-style
   flat swatches, not photographic bands; same for the cross-section.

## Plan adjustments forced by these decisions

- **Phase A** grows: the strata table must define depositible materials with
  a deposit type (dirt-bearing sediment → alluvial dirt; rock grit → thin
  rock-flush), and `strataMap` must handle accretion (R can recover, A can
  decrease) alongside erosion — not just the monotonic cut-depth model from
  Pass 1.
- **Surface driven by strata:** the terrain material shows the column's
  current top-layer (table lookup by depth against `strataMap` R/exposure),
  not the painted `surfaceMaterialMap`; painting routes through to
  `strataMap` (see decision 6 clarification). A painted "grass" on a column
  already cut into rock is invalid and must be rejected (or clamped) rather
  than stored, because strata is the source of truth.
- **Phase B** grows: erosion → *deposition as material* — deposited mass
  lands in the downslope column's column-stack top and flips its surface
  material to the deposit type (decision 2), while the sediment flux keeps
  its conservation symmetry.
- **Phase C** unchanged: edge ribbons; add spring-line discharge visibility
  on the cross-section (decision 5).
- **Phase D** grows: infiltration must handle deposition flipping permeability
  (alluvium is permeable even over rock), and perched flow must detect
  outcrops/map-edge to trigger spring discharge.
- **Phase E**: `SavedSimulationTextures` must serialize the new variables,
  and unit tests must cover: alluvium accretion conserving total material;
  grass regrowth gated on cut depth; bedrock never eroding below base; spring
  discharge not teleporting water.

## Post-decision verification (workflows `9c065c7a`, `b5325285`)

Four verification checks were run against the decision-adjusted plan; two
advisor runs failed technically (session-stall errors), so two consolidated
retry runs covered every check and completed: `consistency-oracle`
(`7ff9261c`) and `mesh-render-verify-2` (`9a8d5a1f`). The data-model
re-derivation (`reground-oracle` `a8ce3b54`, failed) was settled directly in
the parent: its only open question was whether 4 scalars per column suffice
with alluvium, and the answer — revised column model below — follows from the
consistency findings plus my own verification of `water-height.frag` and
`sediment-flow.frag`.

### Corrections to the plan (accepted findings)

- **C1 — Phase order inverted.** The mesh *already* follows the live sim:
  `src/scene/systems/updateTerrainGeometry.ts` reads the 512² render target
  every frame and rewrites vertices, called every frame from
  `src/renderer/systems/simulation.ts` (via `rendererSyncSystem.ts`). With
  160 mesh segments over 40 world units (0.25/unit) vs 0.078/unit texels,
  strata layers (0.05–0.5) **cannot be resolved by geometry at all** —
  strata must be shown as **depth-derived color**. Phase A is therefore the
  **strata material**; GPU vertex displacement is an optional performance
  task (4 MiB `Float32Array` per frame + synchronous readback stall), not a
  prerequisite. (Pass 1's "mesh built once from static DEM" premise was
  stale; the CPU readback path is live.)
- **C2 — Keep the CPU geometry path until re-pointed.** If geometry stopped
  being rebuilt: `getTerrainHeightAt` (animals, `animal.ts:265`) returns
  static DEM heights (animals float/sink), raycast picking
  (`selection.ts`, `addWater.ts`, `terrainPaintingSystem.ts`) hits the
  un-eroded surface, and CPU-only painted bumps
  (`createTerrainHeightEditing`, re-applied in `updateTerrainGeometry.ts`)
  go invisible unless a vertex shader also binds `terrainEditMap`.
- **C3 — Material reachability checklist (blocks the strata-material task).**
  A new `MaterialEnum.Strata` needs: a new visualization mode id, cases in
  **both** the `visualization.ts` switch and `getCurrentMaterial` (else the
  mode silently falls back to `WaterFlow` every pass), a `_materialOptions`
  entry in `GameUI.tsx`, registration in `scene/systems/init/material.ts`,
  bindings in the `storage.ts` load path, and texture delivery via
  `TextureEnum`/`setTexture` in `scene/resources/texture.ts`.
- **C4 — Shadows are a decision, not a defect.** `receiveShadow` only works
  with lighting/shadow-chunk materials; a plain `ShaderMaterial` must set
  `lights: true` with `<common>`/`<shadowmap_pars_fragment>` includes, or
  terrain intentionally stops receiving shadow — acceptable under decision 7
  (flat swatches); state it explicitly in the task.
- **C5 — Wireframe shares terrain geometry** (`init/mesh.ts` passes the same
  geometry to the `MeshBasicMaterial` overlay): with the CPU path both stay
  aligned automatically; with GPU-only displacement the overlay floats.

### Revised alluvium model (fixes the blocking finding)

Do **not** model deposition as decrementing cut depth — a column already at
original elevation couldn't accept deposits: either mass is silently discarded
or capacity depends on the importer, breaking the export-purity rule
(`sediment-flow.frag:181-260`; `outfluxAt`/`granularOutfluxAt` are pure
functions of the exporter re-evaluated bit-identically on import).
Instead, per column store: **static rock-top** (`baseHeight`), **remaining
unconsolidated thickness R** above it (recovers as deposits arrive, decreases
as it erodes; can exceed its authored value — deposits build *upward*), the
**material id of that cover**, and **perched/saturated depths**. Exposure =
which layer the surface elevation `baseHeight + R` sits in; the
`originalSurface`-pinned "cut depth A" from Pass 1 is dropped.
- **Deposit type must travel with the flux:** suspended load is currently a
  scalar amount with no source-material channel. Add a second channel (e.g.
  G = sediment-type id, or two flux channels) so sand lands as sand and rock
  grit as rock-flush; otherwise "mutates the type of material downhill"
  (decision 2) is unimplementable. Reuse the existing pure-function
  export/import symmetry for the new flux.
- **Erosion must go both directions:** extend `availableSoilAt()`'s
  `baseHeight − erodibleDepth` proxy to an interface lookup — incision from
  the surface downward **and** basal erosion at the rock-top contact (for
  the rare case a column thins to rock then gets covered).

### Revised water model (fixes the gap findings)

- **Infiltration hook exists:** `water-height.frag` `applyMaterialDrainage`
  already scales drainage by an `infiltrationRate` per surface-material id,
  and the "lost" water simply disappears. Refactor so that fraction
  transfers into the strata column (surface → `strataMap`) — that is where
  the plume originates. Guard with one shared availability check per cell so
  erosion and infiltration never draw the same material twice.
- **Perched flow has no existing mechanism:** nothing tracks subsurface
  water today. `subsurfaceFlow` carries per column: (R) remaining cover
  thickness, (G) perched-water depth on rock-top, (B) saturated thickness
  within cover, (A) cover material id. Perched routing reuses the D8
  "re-evaluate from exporter" pattern against **static rock-top**.
- **Edge outflow does not exist today:** water recirculates within the 512²
  grid (`sediment-flow.frag:213` hard-returns `0.0` at borders — reusing
  that idiom would never deliver decision 5). Require an explicit **edge
  sink** — perched (or surface) flow reaching the map border leaves the
  system — and spring **emission** at outcrops (a column whose cover is cut
  to rock, or the border itself): a capped per-step source into
  `waterHeight`, not a teleport.
- **GCR facts (design fits):** variables are strictly 2D RGBA — no 3D
  textures; `addVariable` before `setVariableDependencies`; both new
  variables must be added to `getAllVariables` **and** to
  `SavedSimulationTextures` or they silently don't survive save/load.

### Remaining risks

- 160 vs 512 resolution mismatch: strata visible via color only; geometry
  can't show a 0.05 grass layer — accepted by design.
- Painted offsets vs chain-space: strata depth must key off **chain-space**
  bed + rock-top, not painted total height, or painted bumps mint/delete
  soil (MEDIUM).
- Ribbon seams to mesh vertex rows: author the cross-section against the
  **current** geometry path (CPU-rebuilt) so tops track correctly (MEDIUM).
- Float precision drift on cumulative depth: keep depth deltas symmetric
  (add/subtract through the same chain functions) (LOW).
- The 3 `sedimentConservation`-style tests must keep passing with the new
  flux channels (verify early in Phase B).

## Evidence and run ids

- `oracle` report: run `807716fb-660d-423e-8a74-49631e58e195` (fork of parent session)
- `reviewer` report: run `b0f79c68-7660-4ae3-bee3-7e82edfeb15b` (fresh-context fallback; first attempt `ff207c8b` failed)
- Verification: `consistency-oracle` `7ff9261c`, `mesh-render-verify-2` `9a8d5a1f` (completed); `reground-oracle` `a8ce3b54`, `mesh-render-verify` `0a5d6f4a`, `water-verify` `f1eac44c`, `water-verify-2` `8bcf8471` (all failed technically — covered by consolidated retries / parent verification)
- Verification workflows: `9c065c7a` (V1), `b5325285` (consolidated retries)
- Pass 1 workflow: `e7adbe0c-7376-40ce-8db6-31ee7b4b1803`; retry workflow: `4f0602fa-b3dc-4137-a2b1-75a5e5f0821f`
- Parent-verified sources: `src/gpu/waterFlowSimulation/` (`createGpuWaterFlowSimulation.ts`, `variables/*`), `src/shaders/compute/sediment-flow.frag` (availableSoilAt / bedrock proxy), `src/scene/resources/meshes/terrain.ts`, `src/renderer/resources/simulation.ts` (SIM_SIZE=512), `src/world/factories/terrain.ts` (Default material), `src/terrain/cobbsCreekHeightField.ts` (relief), `src/scene/resources/textures/surfaceMaterial.ts`

## Confidence and what would change the decision

**High.** Both Pass 1 advisors converged on the same architecture from
independent inspection, and every load-bearing claim (including the two
verification corrections above) was spot-checked against real files —
including a direct correction of Pass 1's stale "mesh built once" premise.

What would change the decision:

- Hardware that can't allocate additional RGBA32F render targets → collapse strata state into spare channels of existing variables.
- If >6 layers or per-layer independent moisture is ever required → reconsider stacked per-column textures.
- If existing conservation tests make extending `sediment-flow.frag` infeasible → add a parallel independent erosion path instead.