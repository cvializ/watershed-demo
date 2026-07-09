# TODO List

**Important**: This file is not a checklist to be completed. Items must be specifically requested for implementation - do not implement items from this list without explicit user request.

## Landscape & Terrain
- [ ] LOD (Level of Detail) terrain generation for efficient rendering of large terrains
- [ ] Erosion simulation (water, wind) to create realistic terrain features
- [ ] Different surface types affecting water flow and infiltration:
  - [ ] Permeable surfaces (soil, sand) allowing infiltration
  - [ ] Semi-permeable surfaces (clay, loam) with partial infiltration
  - [ ] Impermeable surfaces (rock, urban areas) causing runoff
  - [ ] Vegetation cover affecting absorption and erosion resistance

## Cloud System
- [ ] Volumetric cloud rendering (raymarching through 3D noise textures)
- [ ] Drifting clouds with wind simulation
- [ ] Cloud layer management with multiple altitudes
- [ ] Dynamic cloud formation and dissipation

## Weather System
- [ ] Rain/snow effects with particle systems
- [ ] Lightning and thunder
- [ ] Day/night cycle with weather transitions

## Water System
- [ ] Realistic water rendering with reflections and refractions
- [ ] Wave simulation
- [ ] Underwater visibility and light scattering

## Vegetation
- [ ] Procedural tree generation with varying species
- [ ] Grass and ground cover with LOD
- [ ] Seasonal changes (leaf color, snow accumulation)

## Lighting & Atmosphere
- [ ] Hemispheric sky lighting with real-time updates
- [ ] Volumetric fog and ambient occlusion
- [ ] Post-processing effects (bloom, color grading)

## Architecture & Refactoring
- [ ] Entity Component System (ECS) refactor for better organization and scalability:
  - [ ] Define core entities: Terrain, Water, Clouds, Vegetation, Lighting
  - [ ] Create component types: TransformComponent, MeshComponent, MaterialComponent, SimulationComponent
  - [ ] Implement systems for processing: RenderingSystem, WaterSimulationSystem, CloudSystem, PhysicsSystem
  - [ ] Migrate existing terrain, water flow, and cloud systems to ECS pattern
  - [ ] Design entity factory functions for creating complex objects (e.g., `createTerrainEntity()`, `createWaterEntity()`)
  - [ ] Implement entity serialization/deserialization for save/load functionality
  - [ ] Performance optimization with signature-based system scheduling

## Performance & Optimization
- [ ] Object culling and frustum clipping optimization
- [ ] Texture streaming for large environments
- [ ] GPU-based physics and simulation