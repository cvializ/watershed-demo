# Entity Component System (ECS) Migration Plan for Watershed Simulator

This document outlines a comprehensive plan to migrate the watershed simulation project to an Entity Component System (ECS) architecture, inspired by the bitecs pattern but adapted for GPU-based fluid simulation.

---

## Overview

**Current State**: Direct GPU computation with separate systems (`createD8Simulation`, `createCloudSystem`, etc.)

**Target State**: ECS pattern where entities represent conceptual objects, components hold data, and systems process entities

**Key Principle**: **No class syntax** - use plain objects and functions following the project's functional programming policy

---

## 1. Understanding Your Current Architecture

### Existing Systems
| System | Purpose | Data |
|--------|---------|------|
| `createCloudSystem` | Animated cloud generation | Cloud density texture |
| `createWaterSourcesSystem` | Water source points | Source positions, amounts, radii |
| `createWaterHeightSystem` | Water height simulation | Water height texture |
| `createD8Simulation` | Main GPU computation pipeline | Orchestrates above systems |

### Key Differences from Game Demo
| Aspect | Game Demo (bitecs) | Your Watershed Project |
|--------|-------------------|----------------------|
| **GPU vs CPU** | Pure CPU simulation | GPU-based computation with Three.js |
| **Scale** | Single-player game entities | Texture-sized grids (512x512) |
| **Data Structure** | Component arrays with entity IDs | Textures with per-pixel data |
| **Rendering** | Canvas 2D drawing | WebGL shaders and materials |

---

## 2. ECS Design for Watershed Simulation

### Core Principles
1. **Entities** = Conceptual objects (Terrain, WaterBody, CloudSystem, etc.)
2. **Components** = Data containers (TransformComponent, SimulationDataComponent)
3. **Systems** = Processing functions (updateWaterHeightSystem, renderSystem)

### Component Design (Plain Objects)

```typescript
// Component definitions - no classes!
export type TransformComponent = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

export type WaterSimulationComponent = {
  heightTexture: THREE.Texture;
  velocityTexture: THREE.Texture;
  cloudShadowTexture: THREE.Texture;
  gridWidth: number;
  gridSize: number;
};

export type CloudSimulationComponent = {
  cloudTexture: THREE.Texture;
  driftSpeed: { x: number; y: number };
};

export type RenderMaterialComponent = {
  material: THREE.Material;
  uniformBindings: Record<string, { value: any }>;
};

export type EntityMetadataComponent = {
  name: string;
  tags: string[];
};
```

### Entity Type Definitions

```typescript
// Plain objects with unique IDs - no classes!
export type ECSEntity = {
  id: number;
  components: Map<string, any>;
};

export type ECSWorld = {
  entities: Map<number, ECSEntity>;
  systems: Array<(world: ECSWorld) => void>;
  nextEntityId: number;
  time: { delta: number; elapsed: number };
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
};
```

---

## 3. Migration Strategy (Phased Approach)

### Phase 1: ECS Foundation & Helper Functions
**Goal**: Establish the basic ECS infrastructure

#### Tasks:
1. Create `src/ecs/` directory structure
2. Implement core ECS types (entities, components)
3. Create `createWorld()` function
4. Implement entity creation/removal helpers:
   - `createEntity(world)`
   - `addComponent(entity, componentName, componentData)`
   - `removeComponent(entity, componentName)`
   - `getComponent(entity, componentName)`

#### Files to Create:
```
src/ecs/
├── types.ts              # Type definitions
├── world.ts             # World creation and management
├── entity.ts            # Entity operations
└── helpers.ts           # Common utility functions
```

---

### Phase 2: Component System Refactoring
**Goal**: Extract existing systems into component patterns

#### Tasks:
1. **WaterSimulationComponent**
   - Extract water simulation data from `createD8Simulation`
   - Wrap GPU computation result in component
   - Maintain texture references

2. **CloudSimulationComponent**
   - Extract cloud data from `createCloudSystem`
   - Store cloud texture and animation parameters

3. **TerrainComponent**
   - Extract terrain mesh, geometry, materials
   - Store reference to heightmap texture

#### Migration Pattern:
```typescript
// BEFORE (current)
const waterSimulation = createD8WaterFlowSimulation(...);

// AFTER (ECS)
const terrainEntity = createEntity(world);
addComponent(terrainEntity, 'transform', {
  position: { x: 0, y: -1.5, z: 0 },
  rotation: { x: -Math.PI / 2, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 }
});

addComponent(terrainEntity, 'waterSimulation', {
  gridWidth: SIM_SIZE,
  gridSize: terrainSize,
  heightTexture: waterHeightVariable.texture,
  velocityTexture: waterVelocityVariable.texture
});
```

---

### Phase 3: System Implementation
**Goal**: Create processing systems that operate on entity components

#### Systems to Implement:

1. **WaterSimulationSystem**
   - Processes: Entities with `WaterSimulationComponent`
   - Updates: GPU computation, texture uniforms
   - Side effects: Updates terrain material uniforms

2. **CloudSystem**
   - Processes: Entities with `CloudSimulationComponent`
   - Updates: Cloud texture animation
   - Side effects: Updates cloud shadow textures

3. **RenderSystem**
   - Processes: Entities with `MeshComponent` + `MaterialComponent`
   - Updates: Scene graph, uniforms
   - Side effects: WebGL rendering

4. **InputSystem** (for future interactivity)
   - Processes: Entities with `InteractableComponent`
   - Updates: Water source placement, cloud parameters
   - Side effects: Modifies simulation components

#### System Pattern:
```typescript
export const waterSimulationSystem = (world: ECSWorld, deltaTime: number): void => {
  for (const [eid, entity] of world.entities) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (!waterSim) continue;
    
    // Update simulation
    updateWaterHeight(waterSim.heightVariable);
    
    // Update uniforms on related materials
    const meshComp = getComponent(entity, 'mesh');
    if (meshComp) {
      updateMaterialUniforms(meshComp.material, {
        uWaterHeightmap: { value: waterSim.heightTexture }
      });
    }
  }
};
```

---

### Phase 4: Entity Factories
**Goal**: Create high-level entity creation functions

#### Factory Functions:
```typescript
// src/ecs/factories.ts

export const createTerrainEntity = (
  world: ECSWorld,
  options?: Partial<TerrainComponent>
): ECSEntity => {
  const entity = createEntity(world);
  
  // Create GPU simulation
  const { width, height } = world.renderer.getDrawingBufferSize();
  const simWidth = 512;
  const terrainSize = 12;
  
  // Height map
  const heightMapTexture = createDisplacementTexture(simWidth, terrainSize);
  
  // Water simulation
  const waterSimulation = createD8WaterFlowSimulation(
    simWidth, terrainSize, world.renderer, heightMapTexture
  );
  
  // Add components
  addComponent(entity, 'transform', {
    position: { x: 0, y: -1.5, z: 0 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });
  
  addComponent(entity, 'geometry', createTerrainGeometry());
  addComponent(entity, 'mesh', {
    mesh: new THREE.Mesh(
      getComponent(entity, 'geometry'),
      new THREE.MeshPhongMaterial()
    ),
    originalMaterial: undefined // Will be set during setup
  });
  
  addComponent(entity, 'waterSimulation', {
    simulation: waterSimulation,
    heightMapTexture,
    cloudShadowTexture: waterSimulation.getCloudShadowTexture(),
    velocityTexture: waterSimulation.getVelocityTexture()
  });
  
  return entity;
};

export const createCloudEntity = (
  world: ECSWorld,
  options?: CloudSimulationComponent
): ECSEntity => {
  const entity = createEntity(world);
  
  // Create cloud system
  const { cloudVariable, updateClouds, getCloudTexture } = createCloudSystem(
    gpuCompute, // Will be passed or created
    512
  );
  
  addComponent(entity, 'cloudSimulation', {
    cloudVariable,
    updateClouds,
    getCloudTexture
  });
  
  return entity;
};
```

---

### Phase 5: Integration & Refactoring
**Goal**: Connect ECS to existing codebase

#### Tasks:
1. Create `src/ecs/integration.ts` for bridging
2. Refactor `main.ts` to use ECS world
3. Update existing systems to work alongside ECS
4. Implement entity serialization for state management

#### Integration Points:
```typescript
// src/ecs/integration.ts

import type { ECSWorld } from './types';
import { createTerrainEntity, createCloudEntity } from './factories';

export const initializeECSWorld = (renderer: THREE.WebGLRenderer, scene: THREE.Scene): ECSWorld => {
  const world = createWorld();
  
  // Add renderer and scene references
  (world as any).renderer = renderer;
  (world as any).scene = scene;
  
  // Create initial entities
  const terrainEntity = createTerrainEntity(world);
  const cloudEntity = createCloudEntity(world);
  
  return world;
};

export const runECSFrame = (world: ECSWorld, deltaTime: number): void => {
  // Run all systems
  for (const system of world.systems) {
    system(world, deltaTime);
  }
};
```

---

## 4. File Structure

### New Directory: `src/ecs/`
```
src/ecs/
├── types.ts                    # Type definitions
├── world.ts                   # World creation and management
├── entity.ts                  # Entity operations (create, addComponent, etc.)
├── helpers.ts                 # Utility functions
├── factories.ts               # Entity factory functions
├── systems/
│   ├── waterSimulationSystem.ts    # Water simulation processing
│   ├── cloudSystem.ts              # Cloud animation processing
│   ├── renderSystem.ts             # Rendering pipeline
│   └── inputSystem.ts              # User input handling (future)
├── integration.ts             # Bridge to existing main.ts
└── utils/
    ├── textureUtils.ts        # Texture management helpers
    └── serialization.ts       # Save/load functionality
```

---

## 5. Performance Considerations

### GPU Texture Management
- Reuse textures across entities where possible
- Implement texture pooling for simulation grids
- Use `DataTexture` with pre-allocated buffers

### System Scheduling
- Consider signature-based scheduling (future optimization)
- Group systems by execution frequency:
  - **Every frame**: Water simulation, clouds
  - **On-demand**: Input processing, serialization

### Memory Optimization
- Use shared textures for common data (e.g., heightmap)
- Implement texture streaming for large terrains

---

## 6. Testing Strategy

### Unit Tests
- Test component operations (add, get, remove)
- Verify system side effects on components

### Integration Tests
- Test entity factory creation
- Verify system execution order
- Check texture uniform updates

### Playwright Tests
- Test water source placement via ECS
- Verify cloud animation integration
- Check visualization mode toggling

---

## 7. Backward Compatibility

### Phased Migration
1. Implement ECS alongside existing code (no breaking changes)
2. Create migration guides for each system
3. Support both old and new patterns during transition

### Temporary Bridge Code
```typescript
// src/ecs/migrationBridge.ts - Temporarily required

export const getWaterSimulationFromECS = (world: ECSWorld) => {
  for (const entity of world.entities.values()) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (waterSim) return waterSim.simulation;
  }
  return null;
};
```

---

## 8. Timeline Estimate

| Phase | Estimated Time | Deliverable |
|-------|---------------|-------------|
| 1. Foundation | 2-3 days | Working ECS core |
| 2. Component Refactoring | 2-3 days | Components extracted from existing systems |
| 3. System Implementation | 3-4 days | Processing systems operational |
| 4. Entity Factories | 2-3 days | High-level entity creation |
| 5. Integration & Testing | 3-4 days | Full migration with tests |

**Total**: ~12-17 days for complete migration

---

## 9. Key Design Decisions

### Why Not bitecs Directly?
1. **GPU vs CPU**: Your project uses GPU-based computation; bitecs is CPU-focused
2. **Texture-based data**: Use Three.js textures as "components" rather than plain arrays
3. **Rendering integration**: Need Three.js scene graph integration

### Adaptations for Your Project
1. **Component storage**: Use `Map` for dynamic component addition/removal
2. **Texture components**: Store Three.js textures directly as components
3. **System ordering**: Explicit system execution order for GPU pipeline

### Functional Programming Compliance
- All data structures use plain objects/arrays/Maps/Sets
- No class syntax (`class { }`) used anywhere
- Pure functions for system processing where possible
- Immutable data patterns for component updates

---

## 10. Next Steps

1. **Review this plan** with the team
2. **Implement Phase 1** (ECS foundation)
3. **Create prototype** with single entity
4. **Add tests** for core functionality
5. **Iterate** on remaining phases

---

## Related Documentation
- Project conventions: `AGENTS.md`
- TODO list item: "Entity Component System (ECS) refactor"
- Existing GPU computation pattern: `src/systems/` directory