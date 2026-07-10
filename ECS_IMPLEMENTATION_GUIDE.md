# ECS Implementation Guide

This guide provides step-by-step implementation instructions for the Phase 1 foundation of the ECS migration.

---

## Step 1: Create Directory Structure

```bash
mkdir -p src/ecs/{systems,utils,factories}
```

---

## Step 2: Implement Core Types (`src/ecs/types.ts`)

```typescript
// src/ecs/types.ts

/**
 * Component data structure (plain objects, no classes)
 */
export type ECSComponent = Record<string, any>;

/**
 * Entity representation - plain object with unique ID and components
 */
export type ECSEntity = {
  id: number;
  components: Map<string, ECSComponent>;
};

/**
 * World containing all entities and systems
 */
export type ECSWorld = {
  entities: Map<number, ECSEntity>;
  systems: Array<(world: ECSWorld, deltaTime: number) => void>;
  nextEntityId: number;
  time: {
    delta: number;      // Time since last frame (seconds)
    elapsed: number;    // Total elapsed time (seconds)
    then: number;       // Previous frame timestamp
  };
  
  // References to core Three.js objects (optional)
  renderer?: import('three').WebGLRenderer;
  scene?: import('three').Scene;
};

/**
 * Component metadata for debugging
 */
export type ComponentMeta = {
  name: string;
  version?: number;
};
```

---

## Step 3: Implement World Creation (`src/ecs/world.ts`)

```typescript
// src/ecs/world.ts

import type { ECSWorld } from './types';

/**
 * Creates a new ECS world instance
 */
export const createWorld = (): ECSWorld => {
  return {
    entities: new Map(),
    systems: [],
    nextEntityId: 0,
    time: {
      delta: 0,
      elapsed: 0,
      then: performance.now()
    }
  };
};

/**
 * Updates world time based on current frame
 */
export const updateWorldTime = (world: ECSWorld): void => {
  const now = performance.now();
  world.time.delta = (now - world.time.then) / 1000;
  world.time.elapsed += world.time.delta;
  world.time.then = now;
};
```

---

## Step 4: Implement Entity Operations (`src/ecs/entity.ts`)

```typescript
// src/ecs/entity.ts

import type { ECSWorld, ECSEntity } from './types';

/**
 * Creates a new entity in the world
 */
export const createEntity = (world: ECSWorld): ECSEntity => {
  const eid = world.nextEntityId++;
  const entity: ECSEntity = {
    id: eid,
    components: new Map()
  };
  
  world.entities.set(eid, entity);
  return entity;
};

/**
 * Adds a component to an entity
 */
export const addComponent = (
  entity: ECSEntity,
  componentName: string,
  componentData: any
): void => {
  entity.components.set(componentName, componentData);
};

/**
 * Removes a component from an entity
 */
export const removeComponent = (entity: ECSEntity, componentName: string): boolean => {
  return entity.components.delete(componentName);
};

/**
 * Gets a component from an entity
 */
export const getComponent = <T = any>(entity: ECSEntity, componentName: string): T | undefined => {
  return entity.components.get(componentName) as T;
};

/**
 * Checks if an entity has a component
 */
export const hasComponent = (entity: ECSEntity, componentName: string): boolean => {
  return entity.components.has(componentName);
};

/**
 * Removes an entity from the world
 */
export const removeEntity = (world: ECSWorld, eid: number): boolean => {
  return world.entities.delete(eid);
};

/**
 * Queries entities with specific components
 */
export const queryEntities = (
  world: ECSWorld,
  componentNames: string[]
): ECSEntity[] => {
  const results: ECSEntity[] = [];
  
  for (const entity of world.entities.values()) {
    const hasAllComponents = componentNames.every(name =>
      entity.components.has(name)
    );
    
    if (hasAllComponents) {
      results.push(entity);
    }
  }
  
  return results;
};
```

---

## Step 5: Implement Helper Functions (`src/ecs/helpers.ts`)

```typescript
// src/ecs/helpers.ts

import type { ECSWorld, ECSEntity } from './types';

/**
 * Clones component data (shallow copy)
 */
export const cloneComponentData = <T>(data: T): T => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return [...data] as T;
  }
  
  return { ...data } as T;
};

/**
 * Updates a component's property immutably
 */
export const updateComponent = <T extends Record<string, any>>(
  component: T,
  updates: Partial<T>
): T => {
  return { ...component, ...updates };
};

/**
 * Gets all entities with a specific component
 */
export const getEntitiesWithComponent = (
  world: ECSWorld,
  componentName: string
): ECSEntity[] => {
  const results: ECSEntity[] = [];
  
  for (const entity of world.entities.values()) {
    if (entity.components.has(componentName)) {
      results.push(entity);
    }
  }
  
  return results;
};

/**
 * Counts entities with specific components
 */
export const countEntitiesWithComponents = (
  world: ECSWorld,
  componentNames: string[]
): number => {
  return queryEntities(world, componentNames).length;
};
```

---

## Step 6: Create Entry Point (`src/ecs/index.ts`)

```typescript
// src/ecs/index.ts

export * from './types';
export * from './world';
export * from './entity';
export * from './helpers';

// Import factories and systems for convenience
import { createTerrainEntity } from './factories';
export { createTerrainEntity };
```

---

## Step 7: Update `main.ts` for ECS Integration

```typescript
// src/main.ts (with ECS integration)

import './style.css';
import * as THREE from 'three';

// Import ECS
import { createWorld, updateWorldTime } from '@/ecs';
import { createTerrainEntity } from '@/ecs/factories';

// Import existing systems
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SIM_SIZE = 512;
const terrainSize = 12;

// Setup scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 20;
const camera = new THREE.OrthographicCamera(
  (frustumSize * aspect) / -2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000
);
camera.position.set(15, 12, 15);
camera.zoom = 2.5;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Create ECS world
const world = createWorld();
world.renderer = renderer;
world.scene = scene;

// Create terrain entity using factory
const terrainEntity = createTerrainEntity(world, {
  position: { x: 0, y: -1.5, z: 0 },
  rotation: { x: -Math.PI / 2, y: 0, z: 0 }
});

// Camera controls
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;

// ... rest of existing UI setup code ...

function setVisualizationMode(mode: number) {
  // Update ECS component materials if needed
}

// Animation loop with ECS
let frameCount = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  
  updateWorldTime(world);
  controls.update();
  
  // Run ECS systems
  for (const system of world.systems) {
    system(world, world.time.delta);
  }
  
  // ... FPS calculation and overlay updates ...
  
  renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (frustumSize * aspect) / -2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = (frustumSize * aspect) / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handle water source input
window.addEventListener('click', (event) => {
  if (world.renderer && world.scene) {
    // Use ECS to find water entities
    const waterEntities = queryEntities(world, ['waterSimulation']);
    
    // Handle click for ECS-based water sources
  }
});
```

---

## Step 8: Run Validation

After implementing each phase:

```bash
npm run validate
```

This ensures:
- No linting errors
- Type safety maintained
- Tests pass
- Build succeeds

---

## Key Patterns to Remember

### Component Definition (NO CLASSES)
```typescript
// ✅ GOOD - Plain objects
export type PositionComponent = {
  x: number;
  y: number;
  z: number;
};

// ❌ BAD - Class syntax
class PositionComponent {
  x: number;
  y: number;
  z: number;
}
```

### Entity Creation
```typescript
// ✅ GOOD - Using helpers
const entity = createEntity(world);
addComponent(entity, 'position', { x: 0, y: -1.5, z: 0 });

// ❌ BAD - Manual creation
const entity = { id: world.nextEntityId++, components: new Map() };
world.entities.set(entity.id, entity);
```

### System Implementation
```typescript
// ✅ GOOD - Pure processing function
export const updatePositionSystem = (world: ECSWorld): void => {
  for (const entity of world.entities.values()) {
    const position = getComponent(entity, 'position');
    if (!position) continue;
    
    // Update position
  }
};

// ❌ BAD - Class with methods
class PositionSystem {
  update(world: ECSWorld) { ... }
}
```

---

## Common Pitfalls to Avoid

1. **Using `any`**: Always define proper component types
2. **Mutating component data directly**: Use `cloneComponentData` and `updateComponent`
3. **Forgetting to add entities to world**: Always call `world.entities.set(eid, entity)`
4. **Missing component removal**: Call `removeComponent` when entities are removed
5. **Not updating time in systems**: Always use `world.time.delta` for frame-rate independence

---

## Testing Checklist

- [ ] Entity creation works correctly
- [ ] Component addition/removal functions properly
- [ ] World time updates on each frame
- [ ] Entity queries return expected results
- [ ] Component cloning doesn't mutate original data

---

## Next Steps After Phase 1

1. Implement component types for your specific needs (WaterSimulation, Cloud, etc.)
2. Create entity factories (`createTerrainEntity`, `createCloudEntity`)
3. Implement processing systems (WaterSimulationSystem, CloudSystem)
4. Integrate with existing Three.js rendering pipeline
5. Add comprehensive tests for each system

---

**Remember**: Follow the project's functional programming policy - no classes, use plain objects and pure functions where possible.