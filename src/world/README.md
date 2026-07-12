# World Directory

This directory contains world-related code that is completely decoupled from the 3D scene and Three.js.

## Important Guidelines

**No code in this directory should have knowledge of the scene, cameras, renderers, or any other Three.js objects.**

### What to Avoid

- References to `THREE.Scene`, `THREE.Camera`, `THREE.Mesh`, or any Three.js types
- Imports from `three` or `@react-three/fiber`
- Functions that take scene/camera/render as parameters
- Direct manipulation of 3D objects or world transforms

### Purpose

This directory is for:

- World logic and data structures
- Entity-component system utilities
- Physics world management (without Three.js integration)
- World boundaries and coordinate systems
- Game logic that doesn't depend on rendering

### Design Principles

- **Separation of Concerns**: World logic should be completely independent of rendering
- **Testability**: Code here can be tested without a Three.js context
- **Reusability**: World logic can be used across different rendering backends

## Structure

| Path         | Description                                |
| ------------ | ------------------------------------------ |
| `src/world/` | Contains world-related utilities and logic |
