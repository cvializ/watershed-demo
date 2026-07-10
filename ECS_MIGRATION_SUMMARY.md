# ECS Migration Summary

## Executive Overview

This project will be migrated from a direct GPU computation pattern to an Entity Component System (ECS) architecture, inspired by the bitecs demo but **adapted for GPU-based watershed simulation** rather than CPU-based game logic.

---

## Why ECS?

### Current State
- **Decoupled systems** exist but no unified entity management
- Water, clouds, and terrain are handled separately
- Difficult to compose complex entities (e.g., terrain with water + clouds)
- No clear pattern for entity creation/removal

### Benefits of ECS
1. **Entity Composition**: Create complex objects by combining components
2. **Data-Driven Design**: Clear separation between data and processing
3. **GPU Integration**: Treat textures as "components" with update methods
4. **Scalability**: Easy to add new entity types (lakes, rivers, clouds)
5. **Testability**: Each system can be tested in isolation

---

## Key Adaptations for Your Project

### 1. GPU Textures as Components
Your project uses Three.js GPUComputationRenderer with textures:
- Water simulation → `WaterSimulationComponent` (contains texture references)
- Cloud animation → `CloudSimulationComponent`
- Height maps → Part of terrain component

### 2. Scene Graph Integration
Your project uses Three.js scene graph:
- Entities map to scene nodes (not just simulation data)
- Need transform, mesh, and material components
- Rendering handled by Three.js renderer

### 3. System Scale
| Aspect | Game Demo | Your Project |
|--------|-----------|-------------|
| Entities | 10-100 objects | 1-5 main entities |
| Component data | Plain arrays | GPU textures + objects |
| Computation | CPU per-frame | GPU compute shaders |

---

## Documentation Created

### 1. `ECS_MIGRATION_PLAN.md` (Main Plan)
Comprehensive 5-phase migration plan:
- Phase 1: ECS foundation (types, world, helpers)
- Phase 2: Component system refactoring
- Phase 3: System implementation
- Phase 4: Entity factories
- Phase 5: Integration and testing

**Key Takeaway**: Implement in small, testable increments. Don't break existing code.

### 2. `ECS_IMPLEMENTATION_GUIDE.md` (Step-by-Step)
Complete code for Phase 1:
```bash
src/ecs/
├── types.ts        # Type definitions
├── world.ts       # World creation and time management
├── entity.ts      # Entity operations (create, addComponent, etc.)
├── helpers.ts     # Utility functions
└── index.ts       # Barrel exports
```

**Key Takeaway**: Use plain objects, no classes. Follow functional programming policy.

### 3. `ECS_CONCEPT_MAPPING.md` (Pattern Translation)
Detailed mapping from game demo to watershed:
- Components → GPU textures + plain objects
- Entities → Scene nodes with simulations
- Systems → Processing functions for GPU data

**Key Takeaway**: The concepts translate, but implementations differ due to GPU vs CPU.

### 4. `ECS_QUICK_REFERENCE.md` (Cheat Sheet)
Copy-paste code patterns:
- World management
- Entity creation/removal
- System implementation
- Common component definitions

**Key Takeaway**: Reference this for common patterns during implementation.

---

## Implementation Roadmap

### Week 1: Foundation (Phase 1)
- [ ] Create `src/ecs/` directory structure
- [ ] Implement `types.ts`, `world.ts`, `entity.ts`, `helpers.ts`
- [ ] Write unit tests for core functions
- [ ] Create `src/ecs/index.ts` barrel exports

**Deliverable**: Working ECS foundation with tests passing

### Week 2: Component Patterns (Phase 2)
- [ ] Define component types (Transform, WaterSimulation, CloudSimulation)
- [ ] Extract existing systems into components
- [ ] Test component read/write operations

**Deliverable**: Components representing existing simulation data

### Week 3: System Implementation (Phase 3)
- [ ] Implement `waterSimulationSystem`
- [ ] Implement `cloudAnimationSystem`  
- [ ] Implement `inputSystem` for mouse interaction
- [ ] Test system execution order

**Deliverable**: Processing systems that update GPU textures

### Week 4: Entity Factories (Phase 4)
- [ ] Create `createTerrainEntity()` factory
- [ ] Create `createCloudEntity()` factory
- [ ] Test entity composition patterns

**Deliverable**: High-level entity creation functions

### Week 5: Integration (Phase 5)
- [ ] Integrate ECS into `main.ts`
- [ ] Migrate existing visualization code
- [ ] Add comprehensive Playwright tests
- [ ] Run full validation pipeline

**Deliverable**: Fully migrated watershed simulator with ECS architecture

---

## Critical Design Decisions

### 1. NO Classes (Functional Programming)
```typescript
// ❌ BAD - Class syntax
class TransformComponent {
  position: Vector3;
}

// ✅ GOOD - Plain object
export type TransformComponent = {
  position: { x: number; y: number; z: number };
};
```

### 2. GPU Textures as Components
```typescript
// Store texture references, don't duplicate data
addComponent(entity, 'waterSimulation', {
  heightTexture: THREE.Texture,
  simulation: gpuSimulationRef
});
```

### 3. Explicit System Order
```typescript
world.systems = [
  updateWorldTime,       // Must be first
  inputSystem,           // Input processed before simulation
  waterSimulationSystem, // GPU computation
  renderSystem,          // Three.js rendering
];
```

### 4. Backward Compatibility
- Keep existing code working during migration
- Create bridge functions for gradual adoption
- No breaking changes until final phase

---

## Testing Strategy

### Unit Tests
```bash
tests/ecs/
├── world.test.ts       # World creation and time updates
├── entity.test.ts      # Entity and component operations
└── systems.test.ts     # System execution order
```

### Integration Tests
```bash
tests/
├── ecs-terrain.test.ts    # Full terrain entity creation
└── ecs-water-input.test.ts  # Mouse interaction with ECS
```

### Validation Pipeline
```bash
npm run validate  # Runs: lint, knip, typecheck, test, build
```

---

## Risk Mitigation

### Risk: Breaking Existing Code
**Mitigation**: Implement ECS alongside existing code, use bridge functions

### Risk: Performance Degradation
**Mitigation**: Profile before/after, optimize GPU texture handling

### Risk: Component Proliferation
**Mitigation**: Group related data into single components (e.g., Transform)

### Risk: System Ordering Issues
**Mitigation**: Document execution order, add validation tests

---

## Success Criteria

### Functional Requirements
- [ ] All existing visualization modes work with ECS
- [ ] Water sources can be added via mouse click
- [ ] Cloud animation runs correctly
- [ ] No visual regressions from original code

### Technical Requirements
- [ ] All tests pass (unit + integration + Playwright)
- [ ] Type checking passes with no `any` types
- [ ] No linting errors (oxlint)
- [ ] Build completes successfully
- [ ] Performance is equal or better than original

---

## Next Steps

1. **Review this summary** with stakeholders
2. **Start Phase 1 implementation** (see `ECS_IMPLEMENTATION_GUIDE.md`)
3. **Set up test infrastructure** for ECS module
4. **Implement core types and helpers**
5. **Write initial unit tests**

---

## Related Files

### Documentation
- `ECS_MIGRATION_PLAN.md` - Main implementation plan
- `ECS_IMPLEMENTATION_GUIDE.md` - Step-by-step guide
- `ECS_CONCEPT_MAPPING.md` - Pattern translation reference
- `ECS_QUICK_REFERENCE.md` - Code snippets cheat sheet

### Existing Code
- `src/systems/createD8Simulation.ts` - Water simulation
- `src/systems/createCloudSystem.ts` - Cloud animation
- `src/systems/createWaterSourcesSystem.ts` - Water sources

### Configuration
- `AGENTS.md` - Project conventions (no classes, functional programming)
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies (Three.js, GPUComputationRenderer)

---

## Question Checklist

Before starting implementation, ensure you understand:

1. ✅ **ECS concept**: How components store data vs systems process data
2. ✅ **GPU integration**: Textures as "components" with update methods
3. ✅ **Functional programming**: No class syntax, use plain objects
4. ✅ **System order**: Why execution sequence matters for GPU computation
5. ✅ **Testing approach**: How to test GPU texture updates
6. ✅ **Migration strategy**: How to avoid breaking existing code

---

**Final Note**: This is a substantial architectural change. Take it one phase at a time, test thoroughly, and keep the existing code working throughout the migration process.

**Recommended Start**: Implement `src/ecs/types.ts` and verify it compiles correctly.