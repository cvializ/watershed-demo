# Components

This directory contains ECS (Entity Component System) components for the project.

## Component Basics

Components are defined using a Structure of Arrays (SoA) pattern. Each component is an object where properties represent individual data fields, and each field contains an array of values for all entities.

### Structure of Arrays (SoA)

Instead of an Array of Structures like:

```typescript
// Array of Structures (AoS) - NOT used here
interface TransformAoS {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}
const transforms: TransformAoS[] = [];
```

We use Structure of Arrays (SoA):

```typescript
// Structure of Arrays (SoA) - used here
export const Transform = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
  rx: f32([]),
  ry: f32([]),
  rz: f32([]),
};
```

### Benefits of SoA

- **Cache efficiency**: When iterating over a single field (e.g., all x positions), data is contiguous in memory
- **Vectorization**: SIMD operations can process multiple array elements simultaneously
- **Flexibility**: Easy to iterate over specific component types in systems
- **Serialization**: Simple to serialize/deserialize individual arrays

## Data Type Requirements

All component data must be **serializable**. This means:

### ✅ Allowed Data Types

- Primitive types: `number`, `string`, `boolean`
- Arrays of primitives
- Plain objects containing only serializable types
- BitECS serialization types (e.g., `f32([])`)

### ❌ Forbidden Types

- **Functions**
- **Classes** or class instances
- **Map**, **Set**, or other complex collections
- **References** to objects (like DOM elements, Three.js objects)
- **Symbols** or **BigInt**

### Example Component Guidelines

```typescript
// ✅ Good - pure numeric data
export const Velocity = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
};

// ❌ Bad - contains non-serializable reference
export const MeshRef = {
  mesh: f32([]), // Should only contain serializable data
};

// ❌ Bad - contains function
export const BrokenComponent = {
  value: f32([]),
  callback: () => {}, // Functions are not serializable
};
```

## Tag Components

Some components serve as simple tags to mark entities with certain properties:

```typescript
export const Camera = {};
export const Cube = {};
```

Tag components have no data fields - they simply identify entities.

## Best Practices

1. **Keep components pure**: Only store raw data, no logic
2. **Separate concerns**: Use separate components for different responsibilities (e.g., `Position` vs `Transform`)
3. **No external references**: Components should not reference Three.js objects, DOM elements, or other runtime objects
4. **Deserialize-safe**: Components should be reconstructable from serialized data alone
5. **Minimal dependencies**: Components should not depend on external libraries or runtime environments
