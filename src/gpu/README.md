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

**Pattern**: This is a **Dependency Graph** or **Directed Acyclic Graph (DAG)** pattern where:

- Each `Variable` is a node
- Dependencies define edges between nodes
- The renderer topologically sorts variables to determine compute order

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

| Variable        | Purpose                    | Dependencies          |
| --------------- | -------------------------- | --------------------- |
| `cloudDensity`  | Animated procedural clouds | Self (temporal)       |
| `waterSources`  | Water addition points      | Self                  |
| `waterHeight`   | Surface water depth        | Clouds, Sources, Self |
| `waterVelocity` | Flow direction/magnitude   | WaterHeight           |
| `testing`       | Time-based testing effect  | Self                  |

---

## Well-Known Pattern Mappings

### 1. Dataflow Programming Pattern

The GPU computation system embodies dataflow programming:

- **Nodes**: Shader programs that transform input textures to output
- **Edges**: Texture dependencies between variables
- **Buffers**: Textures storing state across frames (double-buffered by GPUComputationRenderer)
- **Execution**: Triggered by `gpuCompute.compute()` which propagates data through the graph

```
Clouds ──────┐
             ├──→ WaterHeight → Velocity
Sources ─────┘
Testing ───────→ (visualization)
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
    ├── createGpuWaterFlowSimulation.ts  # Main factory
    └── variables/             # Individual GPU variables
        ├── createGpuClouds.ts       # Cloud animation
        ├── createGpuWaterSources.ts # Water addition points
        ├── createGpuWaterHeight.ts  # Surface water depth
        └── createGpuWaterVelocity.ts # Flow computation
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
