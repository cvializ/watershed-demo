# GPU Computation System

## Architecture Overview

The repository implements a **modular, composition-based GPU simulation system** using Three.js's `GPUComputationRenderer`. The structure follows these core principles:

---

## Core Structure

### 1. Variable-Based Computation Graph

Each simulation module creates a `Variable` in the GPUComputationRenderer:

```typescript
const variable = gpuCompute.addVariable(name, fragmentShader, initialTexture);
gpuCompute.setVariableDependencies(variable, [dependency1, dependency2]);
```

**Pattern**: This is a **Dependency Graph** pattern where:

- Each `Variable` is a node
- Dependencies define edges between nodes, and GCR injects one sampler per edge under the dependency's own name (`waterVelocity`, `heightMap`, ...). Re-declaring such a sampler in a shader is a compile error, so any variable read from another variable needs no custom uniform of its own.
- `compute()` steps variables in **insertion order** - the order of their `addVariable()` calls. There is no topological sort and no cycle detection. Each dependency uniform is bound to `depVar.renderTargets[currentTextureIndex]`, i.e. the **last committed frame**, so creation order matters for declaration only, never for data availability.
- Edges are allowed to form a cycle. `heightMap` (the dynamic bed) reads `sedimentFlow` and `sedimentFlow` reads `heightMap`; because both read the last committed render target, that loop resolves into a deliberate one-step lag rather than half-updated data.

---

### 2. Factory Function Pattern

Each simulation module uses a factory pattern with typed uniforms:

```typescript
export const createGpuWaterHeight = (
  gpuCompute,
  width,
  heightMapTexture,
  ...
): {
  waterHeightVariable,
  initWaterHeight: () => void,
  updateWaterHeight: (time: number) => void
}
```

**Structure**:

- **Variable**: GPU computation texture (render target)
- **Initializer**: Sets up uniforms once after variable creation
- **Updater**: Updates time-varying uniforms each frame

---

### 3. Separation of Concerns

The system decomposes simulation into independent variables:

| Variable        | Purpose                                             | Dependencies                           |
| --------------- | --------------------------------------------------- | -------------------------------------- |
| `cloudDensity`  | Animated procedural clouds                          | Self (temporal)                        |
| `waterSources`  | Water addition points                               | Self                                   |
| `waterHeight`   | Surface water depth                                 | Clouds, Sources, Self                  |
| `heightMap`     | Dynamic bed: base terrain plus accumulated sediment | SedimentFlow, Self                     |
| `waterVelocity` | Flow direction/magnitude over the dynamic bed       | WaterHeight, HeightMap                 |
| `sedimentFlow`  | Suspended load + scheduled bed delta                | Velocity, WaterHeight, HeightMap, Self |
| `testing`       | Time-based testing effect                           | None (no declared dependencies)        |

Dependencies are each declared exactly once, inside the factory that owns the variable. The one
exception is forced by the bed/sediment cycle: GCR needs both `Variable`s to exist before either list
can name the other, so `createGpuTerrainHeight` starts with its self-dependency only and returns
`linkBedToSediment(sedimentFlowVariable)` for the orchestrator to call once both exist.

---

## Well-Known Pattern Mappings

### 1. Dataflow Programming Pattern

The GPU computation system embodies dataflow programming:

- **Nodes**: Shader programs that transform input textures to output
- **Edges**: Texture dependencies between variables
- **Buffers**: Textures storing state across frames (double-buffered by GPUComputationRenderer)
- **Execution**: Triggered by `gpuCompute.compute()`, which steps every variable once in insertion order, reading each dependency's last committed render target

```
Clouds ──────┐
             ├──→ WaterHeight ──→ WaterVelocity ──┬──→ SedimentFlow ──┐  (scheduled bed delta)
Sources ─────┘                     ↑              │                   │
                                HeightMap ←────────┴───────────────────┘

Each arrow is a declared dependency, i.e. an injected sampler:
  waterHeight   → clouds, sources, self
  waterVelocity → waterHeight, heightMap     (routing follows the incised bed, not the seed terrain)
  sedimentFlow  → waterVelocity, waterHeight, heightMap, self
  heightMap     → sedimentFlow, self         (the bed applies what sediment scheduled)

heightMap ⇄ sedimentFlow is a genuine cycle. GCR neither sorts nor rejects it: both sides read the last
committed target, so one pass of exchange lands in the bed on the next. WaterVelocity is the routing
source of truth - sediment never computes its own D8, which is what keeps export and import symmetric.
The Testing Simulation view (mode 6) renders the sedimentFlow texture; `testing` itself declares no
dependencies and feeds nothing.
```

---

### 2. Pipeline Architecture

Each simulation runs as a render pipeline:

1. **Input Phase**: Uniforms set (textures, parameters)
2. **Compute Phase**: Fragment shader executes per-pixel
3. **Output Phase**: Result stored in render target texture

```typescript
// Input setup
uniforms.uTime.value = gameTime;
uniforms.terrainHeightmap.value = heightMapTexture;

// Trigger pipeline
gpuCompute.compute();

// Output access
const resultTexture = gpuCompute.getCurrentRenderTarget(variable).texture;
```

---

### 3. Component-Composite Pattern

The system composes multiple GPU variables into a unified interface:

```typescript
type WaterFlowVisualization = {
  compute: (deltaTime, gameTime) => void;
  addWater: (x, y, amount, radius) => void;
  getCloudShadowTexture: () => Texture;
  getVelocityTexture: () => Texture;
  // ... more accessors
};
```

**Structure**:

- **Component**: Individual GPU variables (clouds, water height, etc.)
- **Composite**: Unified simulation interface that orchestrates components

---

### 4. Factory Method Pattern

Each module follows a consistent factory structure:

```typescript
export const createGpuX = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  ...dependencies
): {
  variable: Variable;
  init: () => void;      // One-time setup after GPU initialization
  update: (time) => void; // Per-frame uniform updates
}
```

---

### 5. Uniform Interface Pattern (Type-Safe Uniforms)

Using TypeScript interfaces for uniform types:

```typescript
export type WaterHeightUniforms = {
  terrainHeightmap: THREE.IUniform<THREE.Texture>;
  simulationSpeed: THREE.IUniform<number>;
  // ...
};
```

**Benefit**: Compile-time uniform name checking with `getUniforms<UniformType>()` helper.

---

## Technical Details

### Double Buffering

`GPUComputationRenderer` automatically handles ping-pong rendering:

- Current frame writes to output texture
- Next frame reads from that texture as input
- Managed transparently by the renderer

### Sediment Flow Texel Layout

`sedimentFlow` is an RGBA32F texture whose channels are load-bearing, not incidental (plan A1):

| Channel | Meaning                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| R, G    | Unit transport direction (zero where the cell is dry or still)                     |
| B       | Suspended load in bed-equivalent height units                                      |
| A       | Signed bed delta scheduled for the next committed bed step: `deposition - erosion` |

Channel A is a _schedule_, not a rate: `terrain-height.frag` adds it to the bed on the next committed
step, which is why the debug view (mode 6) draws positive values as deposition and negative ones as
erosion. Both channels are mass-conserving by construction - export and import in
`sediment-flow.frag` are two evaluations of the same `outfluxAt()` helper on the same texel read.

### Sediment Parameters

`createGpuSedimentFlow` keeps parameters as custom uniforms (textures it reads from other variables
come through declared dependencies instead) and sets these defaults:

| Uniform              | Default | Role                                                              |
| -------------------- | ------- | ----------------------------------------------------------------- |
| `erosionCoefficient` | 0.01    | Driven by `world.erosionRate` via `setErosionRate()`              |
| `capacityExponent`   | 1.5     | Shape of the transport-capacity curve                             |
| `criticalSpeed`      | 0.02    | Below this, flow neither cuts nor carries                         |
| `detachRate`         | 0.004   | Rate limit on detachment (1 = unlimited)                          |
| `settleRate`         | 0.06    | Rate limit on settling                                            |
| `transferCap`        | 0.5     | Max fraction of a cell's load exported per step                   |
| `erodibleDepth`      | 0.35    | Bedrock floor = base displacement - this                          |
| `dtScale`            | 1.0     | Set every frame by `updateSedimentFlow(dt)`, clamped to [0.25, 2] |

`createGpuWaterFlowSimulation.compute()` calls `updateClouds`, `updateWaterHeight`,
`updateSedimentFlow` and `updateTesting` before `gpuCompute.compute()`. The erosion slider reaches the
shader through `setSedimentErosionRate(world.erosionRate)` → `setErosionRate`, so nothing outside the
simulation writes these uniforms directly.

### Temporal Feedback

Variables can depend on themselves for temporal integration:

```typescript
gpuCompute.setVariableDependencies(waterHeightVariable, [
  cloudShadowVariable,
  waterSourcesVariable,
  waterHeightVariable, // Self-dependency for temporal state
]);
```

This creates feedback loops essential for simulation stability.

---

## Simulation Flow

1. **Initialization**: Create all variables, set up dependencies, initialize textures
2. **Per-Frame Update**:
   - Update time-varying uniforms (time, parameters)
   - Call `gpuCompute.compute()` to propagate data through the dependency graph
   - Access result textures for visualization or further processing

---

## Directory Structure

```
src/gpu/
├── testingSimulation/         # Testing texture simulation
│   └── createTestingTexture.ts
└── waterFlowSimulation/       # Water flow simulation
    ├── createGpuWaterFlowSimulation.ts  # Main factory: creates, links and computes every variable
    ├── createCloudSphereSystem.ts       # Cloud sphere geometry companion
    ├── saveLoadSimulationState.ts       # Render-target snapshots for save/load
    └── variables/             # Individual GPU variables
        ├── createGpuClouds.ts         # Cloud animation
        ├── createGpuWaterSources.ts   # Water addition points
        ├── createGpuWaterHeight.ts    # Surface water depth
        ├── createGpuTerrainHeight.ts  # Dynamic bed (integrates sediment deltas)
        ├── createGpuWaterVelocity.ts  # D8 flow computation
        └── createGpuSedimentFlow.ts   # Suspended load + scheduled bed delta
```

---

## Summary

| Traditional Pattern  | GPU Computation Equivalent                 |
| -------------------- | ------------------------------------------ |
| Class/Object         | Variable + Uniforms                        |
| Method               | Fragment Shader                            |
| State                | Render Target Texture                      |
| Dependency Injection | `setVariableDependencies()`                |
| Pipeline             | `compute()` call propagating through graph |
| Composition          | WaterFlowVisualization composite           |

The architecture transforms traditional object-oriented simulation concepts into a **shader-based dataflow system** where:

- Data flows through executable graph nodes
- State persists in GPU textures
- Composition happens via dependency declaration rather than inheritance
