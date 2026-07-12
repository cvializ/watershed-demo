# Scene Directory

This directory contains scene management code that bridges the world data (ECS) with the 3D rendering (Three.js).

## Role

The `src/scene` directory serves as the **renderer layer** that:

1. **Consumes world data** from the ECS world (via bitecs components)
2. **Updates Three.js objects** in the scene based on that data
3. **Handles Three.js object creation and lifecycle**

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   World     │ →  │ Scene Systems│ →  │ Three.js     │
│ (ECS Data)  │    │              │    │ (Rendering)  │
└─────────────┘    └──────────────┘    └──────────────┘
```

## Components

| File                  | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `initSystem.ts`       | Initializes scene resources when ECS entities are added    |
| `syncSystem.ts`       | Syncs ECS component data to Three.js objects each frame    |
| `resources.ts`        | Creates the base scene with lighting and configuration     |
| `sceneUtils.ts`       | Utility functions for scene queries (e.g., getting camera) |
| `resources/camera.ts` | Creates Three.js camera objects                            |
| `resources/cube.ts`   | Creates Three.js mesh objects for cubes                    |

## Systems

### Init System (`sceneInitSystem`)

Runs once at startup to create scene resources when ECS entities are added:

- Creates cube meshes when `Cube` component is added
- Creates cameras when `Camera` component is added

### Sync System (`sceneSyncSystem`)

Runs every frame to synchronize ECS data to the scene:

- Updates camera position from `Position` component
- Updates mesh positions and rotations from `Transform` and `MeshRef` components

## Key Principles

- **World data flows in**: ECS world → Scene systems → Three.js objects
- **No reverse dependencies**: World directory has no knowledge of scene or Three.js
- **One-way data flow**: ECS components drive all visual updates

## Type Definitions

| Type              | Description                                        |
| ----------------- | -------------------------------------------------- |
| `SceneInitSystem` | `(world: World, scene: Scene) => void`             |
| `SceneSystem`     | `(world: World, scene: Scene, dt: number) => void` |

## Usage Pattern

1. ECS system updates components (e.g., `Position`, `Transform`)
2. Scene sync systems detect component changes
3. Scene systems update corresponding Three.js objects
4. Renderer displays updated scene
