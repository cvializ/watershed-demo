# ECS Concept Mapping: Game Demo → Watershed Simulator

This document maps concepts from the bitecs game demo to equivalent patterns in your watershed simulation project.

---

## Core Concept Mapping

### 1. Components → Data Textures + Plain Objects

| Bitecs Component | Watershed Equivalent | Rationale |
|-----------------|----------------------|-----------|
| `Position = { x: [], y: [] }` | `TransformComponent = { position, rotation, scale }` | Plain object for transform data |
| `Velocity = { vx: [], vy: [] }` | `WaterFlowComponent = { velocityTexture, heightTexture }` | GPU textures store grid data |
| `Health = { current: [], max: [] }` | `SimulationComponent = { lastUpdate, errorCount }` | Simulation metadata |

**Key Difference**: Your project uses GPU textures as "components" for simulation data, while the game demo uses plain arrays indexed by entity ID.

---

### 2. Entities → Scene Graph Nodes

| Bitecs Entity | Watershed Entity |
|--------------|-----------------|
| Single game object (player, enemy) | Tree/terrain entity with GPU simulation |

**Example Mapping**:
```typescript
// Bitecs - Player entity
const playerEid = createEntity(world);
Player.add(playerEid);  // Tag component
Position.x[playerEid] = x;
Position.y[playerEid] = y;

// Watershed - Terrain entity
const terrainEntity = createEntity(world);
addComponent(terrainEntity, 'transform', {
  position: { x: 0, y: -1.5, z: 0 },
  rotation: { x: -Math.PI/2, y: 0, z: 0 }
});
addComponent(terrainEntity, 'geometry', geometry);
addComponent(terrainEntity, 'mesh', { mesh: terrainMesh });
addComponent(terrainEntity, 'waterSimulation', waterSimData);
```

---

### 3. Systems → Processing Functions

| Bitecs System | Watershed Equivalent |
|--------------|---------------------|
| `playerInputSystem` | `inputSystem` (mouse click for water sources) |
| `aiSystem` | `cloudAnimationSystem` (procedural cloud motion) |
| `movementSystem` | `waterSimulationSystem` (GPU computation) |
| `collisionSystem` | `renderSystem` (update uniforms, render scene) |

---

## Detailed Component Mapping

### TransformComponent
```typescript
// Bitecs (implicit via Position)
Position.x[eid] = x;
Position.y[eid] = y;

// Watershed (explicit)
addComponent(entity, 'transform', {
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number },
  scale: { x: number; y: number; z: number }
});
```

**Rationale**: Your project uses Three.js transform hierarchy; need full 3D transforms.

---

### WaterSimulationComponent
```typescript
// Bitecs (none - pure simulation)
Velocity.vx[eid] = x;
Velocity.vy[eid] = y;

// Watershed (GPU-based)
addComponent(entity, 'waterSimulation', {
  heightTexture: THREE.Texture,
  velocityTexture: THREE.Texture,
  cloudShadowTexture: THREE.Texture,
  gridWidth: number,
  gridSize: number
});
```

**Rationale**: Water simulation data is stored in GPU textures, not CPU arrays.

---

### CloudSimulationComponent
```typescript
// Bitecs (none)
// Single cloud texture in compute loop

// Watershed (explicit component)
addComponent(entity, 'cloudSimulation', {
  cloudVariable: Variable,  // GPUComputationRenderer variable
  updateClouds: (deltaTime) => void,
  getCloudTexture: () => Texture
});
```

**Rationale**: Clouds are a separate simulation system with their own update loop.

---

### MeshComponent
```typescript
// Bitecs (none - direct canvas drawing)
ctx.fillStyle = '#0f62fe';
ctx.beginPath();
ctx.arc(x, y, r, 0, Math.PI * 2);
ctx.fill();

// Watershed (Three.js entity)
addComponent(entity, 'mesh', {
  mesh: THREE.Mesh,
  originalMaterial: Material,
  wireframeMesh?: THREE.LineSegments
});
```

**Rationale**: Your project uses Three.js scene graph, not direct canvas drawing.

---

## System Mapping in Detail

### timeSystem → updateWorldTime
```typescript
// Bitecs
var timeSystem = (world) => {
  const now = performance.now();
  world.time.delta = (now - world.time.then) / 1000;
  world.time.elapsed += world.time.delta;
  world.time.then = now;
};

// Watershed (same, in ecs/world.ts)
export const updateWorldTime = (world: ECSWorld): void => {
  const now = performance.now();
  world.time.delta = (now - world.time.then) / 1000;
  world.time.elapsed += world.time.delta;
  world.time.then = now;
};
```

---

### playerInputSystem → inputSystem
```typescript
// Bitecs - Player movement and shooting
var playerInputSystem = (world) => {
  const { input, time } = world;
  for (const eid of Player) {
    // Movement logic
    if (input.keys["w"]) Velocity.vy[eid] = -speed;
    // Shooting logic
  }
};

// Watershed - Mouse click for water sources
export const inputSystem = (world: ECSWorld): void => {
  if (!inputState.clicked) return;
  
  // Find entities with water simulation
  const waterEntities = queryEntities(world, ['waterSimulation']);
  
  for (const entity of waterEntities) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (waterSim && inputState.clicked) {
      waterSim.simulation.addWater(
        inputState.clickX,
        inputState.clickY,
        0.1,  // amount
        3     // radius
      );
      inputState.clicked = false; // Reset
    }
  }
};
```

---

### aiSystem → cloudAnimationSystem
```typescript
// Bitecs - Enemies track player
var aiSystem = (world) => {
  let playerX = 0, playerY = 0;
  for (const eid of Player) {
    playerX = Position.x[eid];
    playerY = Position.y[eid];
  }
  for (const eid of Enemy) {
    const dx = playerX - Position.x[eid];
    // AI movement
  }
};

// Watershed - Clouds drift across sky
export const cloudAnimationSystem = (world: ECSWorld): void => {
  const cloudEntities = queryEntities(world, ['cloudSimulation']);
  
  for (const entity of cloudEntities) {
    const cloudComp = getComponent(entity, 'cloudSimulation');
    if (cloudComp) {
      cloudComp.updateClouds(world.time.delta);
    }
  }
};
```

---

### movementSystem → waterSimulationSystem
```typescript
// Bitecs - Update positions based on velocity
var movementSystem = (world) => {
  const dt = world.time.delta;
  for (const eid of world.entities) {
    if (Velocity.vx[eid] !== undefined) {
      Position.x[eid] += Velocity.vx[eid] * dt;
    }
  }
};

// Watershed - GPU-based water flow simulation
export const waterSimulationSystem = (world: ECSWorld, deltaTime: number): void => {
  const waterEntities = queryEntities(world, ['waterSimulation']);
  
  for (const entity of waterEntities) {
    const waterSim = getComponent(entity, 'waterSimulation');
    if (waterSim) {
      // Run GPU computation
      waterSim.heightTexture = waterSim.simulation.compute(deltaTime);
      
      // Update terrain material uniforms
      updateTerrainUniforms(entity, {
        uWaterHeightmap: { value: waterSim.heightTexture },
        uCloudShadowMap: { value: waterSim.cloudShadowTexture }
      });
    }
  }
};
```

---

### renderSystem → (combined systems)
```typescript
// Bitecs - Direct canvas rendering
var renderSystem = (world) => {
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, width, height);
  
  for (const eid of Player) {
    ctx.fillStyle = '#0f62fe';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

// Watershed - Three.js renderer + manual rendering updates
export const renderSystem = (world: ECSWorld): void => {
  // Let Three.js renderer handle most of the work
  if (world.renderer && world.scene) {
    world.renderer.render(world.scene, camera);
  }
};

export const postRenderSystem = (world: ECSWorld): void => {
  // Update debug UI, FPS counters
  updateFPSDisplay(world);
  
  // Handle visualization mode changes
  updateVisualizationModes();
};
```

---

## Tag System Mapping

### Set-based Tags → Component-based Tags
```typescript
// Bitecs - Uses JavaScript Sets for entity tags
var Player = new Set;
var Enemy = new Set;

// Watershed - Uses component presence as tag
addComponent(entity, 'tags', ['player', 'interactable']);
// or simply add a marker component
addComponent(entity, 'playerTag', {});  // Empty object as tag

// Query for "tagged" entities
const players = queryEntities(world, ['playerTag']);
```

---

## Data Access Patterns

### Bitecs - Direct Array Indexing
```typescript
Position.x[eid] = 10;     // Read
Velocity.vx[eid] += 5;    // Write
```

### Watershed - Component Map Access
```typescript
const transform = getComponent(entity, 'transform');
transform.position.x = 10;  // Read
addComponent(entity, 'transform', { ...transform, position: { x: 10 } });  // Write
```

**Alternative for mutable components**:
```typescript
const transform = getComponent(entity, 'transform');
if (transform) {
  transform.position.x = 10;  // Direct mutation allowed for performance
}
```

---

## Entity Lifecycle Mapping

### Creation
```typescript
// Bitecs
var playerEid = createPlayer(world, 100, 200);
// Adds to entity Set
// Sets Position.x[eid], Velocity.vx[eid], etc.

// Watershed
const terrainEntity = createTerrainEntity(world, {
  position: { x: 0, y: -1.5, z: 0 }
});
// Creates GPU simulations
// Adds all components at once via factory
```

---

### Destruction
```typescript
// Bitecs
removeEntity(world, eid);
Player.delete(eid);  // Remove from tag Set

// Watershed
removeEntity(world, eid);
// Components automatically removed via Map delete
```

---

## GPU Texture as Component Pattern

### Single Simulation Component
```typescript
// Your current approach (single simulation)
const waterSimulation = createD8WaterFlowSimulation(
  SIM_SIZE, terrainSize, renderer, heightMapTexture
);

// ECS approach (entity with simulation component)
addComponent(terrainEntity, 'waterSimulation', {
  gridWidth: SIM_SIZE,
  gridSize: terrainSize,
  simulation: waterSimulation,  // Reference to simulation object
  heightTexture: null,          // Updated during compute()
  velocityTexture: null,
  cloudShadowTexture: null
});
```

### Multiple Water Bodies (Future)
```typescript
// Create multiple independent water bodies
const lakeEntity = createTerrainEntity(world, {
  position: { x: -5, y: -1.5, z: 0 }
});
addComponent(lakeEntity, 'waterSimulation', {
  // Independent simulation
});

const riverEntity = createTerrainEntity(world, {
  position: { x: 5, y: -1.5, z: 0 }
});
addComponent(riverEntity, 'waterSimulation', {
  // Independent simulation
});

// Each entity has its own GPU computation!
```

---

## System Execution Order

### Bitecs
```typescript
var systems = [
  timeSystem,
  playerInputSystem,
  aiSystem,
  movementSystem,
  boundarySystem,
  collisionSystem,
  spawnSystem,
  renderSystem
];
```

### Watershed (Proposed Order)
```typescript
world.systems = [
  updateWorldTime,           // Update frame timing
  inputSystem,               // Process user input (add water sources)
  cloudAnimationSystem,      // Update cloud textures
  waterSimulationSystem,     // Run GPU computation
  renderSystem,              // Render scene with Three.js
  postRenderSystem           // UI updates, debug overlay
];
```

---

## Key Differences Summary

| Aspect | Bitecs (Game) | Your Project (Watershed) |
|--------|--------------|-------------------------|
| **Data storage** | Plain arrays | GPU textures + plain objects |
| **Scale** | Single digits of entities | 1 terrain entity with GPU grid |
| **Computation** | CPU-based | GPU-based (Three.js GPUComputationRenderer) |
| **Rendering** | Canvas 2D drawing | WebGL scene graph |
| **Component types** | Position, Velocity, Health | Transform, WaterSimulation, CloudSimulation |
| **Entity count** | 10-100 | 1-5 (main entities) |

---

## Migration Strategy Mapping

| Bitecs Feature | Watershed Implementation |
|---------------|------------------------|
| Component arrays | GPU textures + plain objects |
| Tag Sets | Component presence checks |
| Entity creation helpers | Factory functions (`createTerrainEntity`) |
| System array | ECS world systems array |

---

## Testing Concept Mapping

### Unit Test Patterns
```typescript
// Bitecs - Test component operations
test('addEntity adds to world.entities', () => {
  const eid = addEntity(world);
  expect(world.entities.has(eid)).toBe(true);
});

// Watershed - Test component operations
test('addComponent stores component data', () => {
  const entity = createEntity(world);
  addComponent(entity, 'transform', { x: 0 });
  expect(getComponent(entity, 'transform')).toEqual({ x: 0 });
});
```

### Integration Test Patterns
```typescript
// Bitecs - Test system execution
test('movementSystem updates positions', () => {
  const eid = createEntity(world);
  Velocity.vx[eid] = 10;
  
  movementSystem(world);
  expect(Position.x[eid]).toBeGreaterThan(0);
});

// Watershed - Test system execution
test('waterSimulationSystem updates height texture', () => {
  const terrainEntity = createTerrainEntity(world);
  
  waterSimulationSystem(world, 0.016); // ~60fps
  
  expect(waterSim.heightTexture).toBeDefined();
});
```

---

## Performance Optimization Mapping

### Bitecs - Object Pooling
```typescript
// Pre-allocate arrays
var Position = { x: [], y: [] };
Position.x.length = MAX_ENTITIES;
```

### Watershed - Texture Reuse
```typescript
// Pre-allocate GPU textures
const heightTexture = new THREE.DataTexture(
  width, height, 
  format, type,
  null
);
```

---

## Final Notes

1. **Start simple**: Implement Phase 1 foundation before refactoring existing code
2. **Test incrementally**: Each system can be tested in isolation
3. **GPU integration**: Treat GPU textures as "components" with update methods
4. **Backward compatibility**: Keep existing systems working during migration
5. **Functional purity**: Follow project's no-class, arrow-function policy

This mapping provides a foundation for translating ECS concepts from game development to GPU-based watershed simulation while respecting your project's unique constraints and patterns.