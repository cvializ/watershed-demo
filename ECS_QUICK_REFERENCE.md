# ECS Quick Reference

A quick reference card for common ECS patterns in your watershed project.

---

## 1. Core Types

```typescript
// src/ecs/types.ts

export type ECSComponent = Record<string, any>;

export type ECSEntity = {
  id: number;
  components: Map<string, ECSComponent>;
};

export type ECSWorld = {
  entities: Map<number, ECSEntity>;
  systems: Array<(world: ECSWorld, deltaTime: number) => void>;
  nextEntityId: number;
  time: { delta: number; elapsed: number; then: number };
  renderer?: WebGLRenderer;
  scene?: Scene;
};
```

---

## 2. World Management

```typescript
// src/ecs/world.ts

import { createWorld, updateWorldTime } from '@/ecs';

const world = createWorld();
world.renderer = renderer;
world.scene = scene;

// Update at start of each frame
updateWorldTime(world);
```

---

## 3. Entity Operations

```typescript
// src/ecs/entity.ts

import { createEntity, addComponent, getComponent } from '@/ecs';

// Create entity
const entity = createEntity(world);

// Add components
addComponent(entity, 'transform', {
  position: { x: 0, y: -1.5, z: 0 },
  rotation: { x: -Math.PI / 2, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 }
});

addComponent(entity, 'waterSimulation', {
  gridWidth: 512,
  heightTexture: null
});

// Access components
const transform = getComponent(entity, 'transform');
```

---

## 4. Component Helpers

```typescript
// src/ecs/helpers.ts

import { cloneComponentData, updateComponent } from '@/ecs';

// Clone component (shallow copy)
const cloned = cloneComponentData(original);

// Update component immutably
const updated = updateComponent(component, { position: { x: 10 } });
```

---

## 5. Entity Factories

```typescript
// src/ecs/factories.ts

import { createTerrainEntity, createCloudEntity } from '@/ecs';

// Create terrain with all components
const terrain = createTerrainEntity(world, {
  position: { x: 0, y: -1.5, z: 0 }
});

// Create cloud system
const clouds = createCloudEntity(world);
```

---

## 6. System Implementation

```typescript
// src/ecs/systems/waterSimulationSystem.ts

import { ECSWorld } from '@/ecs/types';
import { queryEntities, getComponent } from '@/ecs';

export const waterSimulationSystem = (world: ECSWorld, deltaTime: number): void => {
  // Find entities with water simulation
  const waterEntities = queryEntities(world, ['waterSimulation']);
  
  for (const entity of waterEntities) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (!waterSim) continue;
    
    // Run GPU computation
    const heightTexture = waterSim.simulation.compute(deltaTime);
    
    // Update terrain material uniforms
    updateTerrainUniforms(entity, {
      uWaterHeightmap: { value: heightTexture }
    });
  }
};
```

---

## 7. Adding Systems to World

```typescript
// src/main.ts

import { waterSimulationSystem, cloudAnimationSystem } from '@/ecs/systems';

world.systems = [
  updateWorldTime,
  inputSystem,
  cloudAnimationSystem,
  waterSimulationSystem,
  renderSystem,
  postRenderSystem
];
```

---

## 8. Query Entities

```typescript
// src/ecs/entity.ts

import { queryEntities, getEntitiesWithComponent } from '@/ecs';

// Query by multiple components
const waterEntities = queryEntities(world, ['transform', 'waterSimulation']);

// Query by single component
const transformEntities = getEntitiesWithComponent(world, 'transform');
```

---

## 9. Remove Entities

```typescript
import { removeEntity, removeComponent } from '@/ecs';

// Remove entire entity
removeEntity(world, eid);

// Remove specific component
const entity = world.entities.get(eid);
if (entity) {
  removeComponent(entity, 'waterSimulation');
}
```

---

## 10. Common Component Definitions

```typescript
// TransformComponent
export type TransformComponent = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

// WaterSimulationComponent
export type WaterSimulationComponent = {
  simulation: any;  // Return value from createD8WaterFlowSimulation
  heightTexture: THREE.Texture | null;
  velocityTexture: THREE.Texture | null;
  cloudShadowTexture: THREE.Texture | null;
  gridWidth: number;
};

// CloudSimulationComponent
export type CloudSimulationComponent = {
  cloudVariable: import('three').addons.misc.Variable;
  updateClouds: (deltaTime: number) => void;
  getCloudTexture: () => THREE.Texture;
};

// MeshComponent
export type MeshComponent = {
  mesh: THREE.Mesh;
  originalMaterial?: THREE.Material;
  wireframeMesh?: THREE.LineSegments;
};

// InputComponent
export type InputComponent = {
  clicked: boolean;
  clickX: number;
  clickY: number;
};
```

---

## 11. Input Handling

```typescript
// src/main.ts (DOM event handlers)

window.addEventListener('click', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  world.inputState.clickX = (event.clientX - rect.left) / rect.width * terrainSize;
  world.inputState.clickY = (event.clientY - rect.top) / rect.height * terrainSize;
  world.inputState.clicked = true;
});

// In input system
export const inputSystem = (world: ECSWorld): void => {
  if (!world.inputState.clicked) return;
  
  const waterEntities = queryEntities(world, ['waterSimulation']);
  
  for (const entity of waterEntities) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (waterSim) {
      waterSim.simulation.addWater(
        world.inputState.clickX,
        world.inputState.clickY,
        0.1,  // amount
        3     // radius
      );
    }
  }
  
  world.inputState.clicked = false;  // Reset after consuming
};
```

---

## 12. Pattern: GPU Computation in System

```typescript
export const gpuSimulationSystem = (world: ECSWorld, deltaTime: number): void => {
  for (const entity of world.entities.values()) {
    const gpuData = getComponent(entity, 'gpuSimulation');
    if (!gpuData) continue;
    
    // Update uniforms before compute
    gpuData.uniforms.uTime.value = world.time.elapsed;
    
    // Run GPU computation
    gpuCompute.compute();
    
    // Get result texture
    const resultTexture = gpuCompute.getCurrentRenderTarget(gpuData.variable).texture;
    
    // Update materials that use this texture
    updateMaterials(entity, { uResultTexture: { value: resultTexture } });
  }
};
```

---

## 13. Common Pitfalls

### ❌ Don't
```typescript
// Missing entity in world
const entity = createEntity(world);
delete world.entities.get(eid);  // Wrong - use removeEntity()

// Mutating component arrays directly
const transform = getComponent(entity, 'transform');
transform.position.x += 1;  // Bad - mutate original
```

### ✅ Do
```typescript
// Proper entity removal
removeEntity(world, eid);

// Immutable component updates
const transform = getComponent(entity, 'transform');
addComponent(entity, 'transform', {
  ...transform,
  position: { x: transform.position.x + 1 }
});
```

---

## 14. Testing Checklist

```typescript
// Unit test pattern
test('createEntity adds to world', () => {
  const world = createWorld();
  const entity = createEntity(world);
  
  expect(entity.id).toBe(0);
  expect(world.entities.size).toBe(1);
});

// System test pattern
test('waterSimulationSystem updates textures', () => {
  const world = createWorld();
  const entity = createTerrainEntity(world);
  
  waterSimulationSystem(world, 0.016);
  
  const waterSim = getComponent(entity, 'waterSimulation');
  expect(waterSim.heightTexture).toBeDefined();
});
```

---

## 15. Debug Helpers

```typescript
// Log all entities with components
export const logWorldEntities = (world: ECSWorld): void => {
  console.log('World entities:', world.entities.size);
  
  for (const [eid, entity] of world.entities) {
    console.log(`Entity ${eid}:`, [...entity.components.keys()]);
  }
};

// Count entities by component
export const countByComponent = (world: ECSWorld, componentName: string): number => {
  let count = 0;
  
  for (const entity of world.entities.values()) {
    if (entity.components.has(componentName)) count++;
  }
  
  return count;
};
```

---

## 16. Migration Tips

1. **Start small**: Create 1-2 components before adding systems
2. **Test incrementally**: Each system can be tested independently
3. **Keep existing code**: Don't remove old systems until new ones work
4. **Use types**: Define TypeScript types for all components
5. **Follow conventions**: No classes, use arrow functions, functional patterns

---

## 17. Quick Entity Creation

```typescript
// Complete terrain entity with all components
export const createTerrainEntity = (world: ECSWorld): ECSEntity => {
  const entity = createEntity(world);
  
  // Transform
  addComponent(entity, 'transform', {
    position: { x: 0, y: -1.5, z: 0 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });
  
  // Geometry
  const geometry = createTerrainGeometry();
  addComponent(entity, 'geometry', geometry);
  
  // Mesh
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial());
  addComponent(entity, 'mesh', { mesh });
  
  // Water simulation
  const waterSim = createD8WaterFlowSimulation(512, 12, world.renderer!, heightMap);
  addComponent(entity, 'waterSimulation', {
    simulation: waterSim,
    gridWidth: 512,
    gridSize: 12
  });
  
  return entity;
};
```

---

## 18. System Order Tips

```typescript
// Correct execution order for GPU-based simulation
world.systems = [
  updateWorldTime,           // 1. Update timing
  inputSystem,               // 2. Process user input
  cloudAnimationSystem,      // 3. Update clouds (if independent)
  waterSimulationSystem,     // 4. Run GPU computation
  renderSystem,              // 5. Render with Three.js
  postRenderSystem           // 6. UI updates, debug overlay
];
```

**Rule of thumb**: Systems that modify data run before systems that consume that data.

---

## 19. Component Versioning (Optional)

```typescript
export type VersionedComponent<T> = {
  data: T;
  version: number;
};

// Use in component storage
export const addComponent = (
  entity: ECSEntity,
  componentName: string,
  componentData: any
): void => {
  const versioned: VersionedComponent<any> = {
    data: componentData,
    version: 1
  };
  
  entity.components.set(componentName, versioned);
};

export const getComponentVersion = (
  entity: ECSEntity,
  componentName: string
): number => {
  const component = entity.components.get(componentName);
  return (component as VersionedComponent<any>)?.version || 0;
};
```

---

## 20. Performance Optimization

```typescript
// Cache query results
let cachedWaterEntities: ECSEntity[] | null = null;

export const getWaterEntitiesCached = (world: ECSWorld): ECSEntity[] => {
  if (!cachedWaterEntities) {
    cachedWaterEntities = queryEntities(world, ['waterSimulation']);
  }
  
  return cachedWaterEntities;
};

// Reset cache when components change
export const addComponent = (entity: ECSEntity, componentName: string): void => {
  entity.components.set(componentName, {});
  cachedWaterEntities = null;  // Invalidate cache
};
```

---

**Remember**: This is a reference, not a rigid structure. Adapt patterns to fit your specific use cases while maintaining the core ECS principles.

---

**Next Step**: Implement Phase 1 foundation (types, world, entity, helpers) before adding complex components and systems.