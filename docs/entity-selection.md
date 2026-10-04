# Entity Selection System

This document describes the entity selection system that allows you to click on renderable entities in the game and view their properties.

## Overview

The entity selection system provides:
- **Click-to-select**: Click on any renderable entity to select it
- **Selected component**: A `Selected` tag component that marks the currently selected entity
- **Entity Selection Panel**: A UI panel that displays properties of the selected entity

## Components

### Selected Component

A tag component that marks the currently selected entity:

```typescript
import { Selected } from "@/components/components";

// Check if an entity is selected (in a system)
if (has(entity$, Selected)) {
  // This entity is currently selected
}
```

## Usage

### 1. Right-Click to Select Entities

Simply right-click on any renderable entity in the game view. The system will:
- Raycast from the mouse position to find intersected objects
- Select the first renderable entity under the cursor
- Add the `Selected` component to that entity
- Display its properties in the Entity Selection Panel (right side of screen)

### 2. React to Selection Changes

Create systems that respond to selected entities:

```typescript
import { query } from "bitecs";
import { Position, Selected } from "@/components/components";

// System that moves selected entities
export const moveSelectedEntities = (world: World, dt: number): void => {
  // Query for entities with both Position and Selected components
  const selectedEntities = query(world, Position, Selected);

  for (const entity$ of selectedEntities) {
    // Move the selected entity upward
    Position.y[entity$] += 5 * dt;
  }
};
```

### 3. Manual Selection Control

You can also programmatically select/deselect entities:

```typescript
import { getEntitySelectionSystem } from "@/scene/systems/entitySelectionSystem";

const selectionSystem = getEntitySelectionSystem();

// Select an entity
selectionSystem.selectEntity(entity$);

// Deselect the current selection
selectionSystem.deselect();

// Get the currently selected entity
const selectedEntity = selectionSystem.getSelectedEntity();
```

## Entity Selection Panel

The Entity Selection Panel automatically displays when an entity is selected. It shows:
- **Entity ID**: The unique identifier of the entity
- **Component Tags**: List of components the entity has (Renderable, Selected, Named, Positioned)
- **Properties**: Detailed information about the entity's components

### Example Panel Output

```
┌─────────────────────────────┐
│ Entity Properties           │
├─────────────────────────────┤
│ Entity ID: 5                │
│                             │
│ Components:                 │
│ [Renderable] [Selected]     │
│         [Positioned]        │
│                             │
│ Details:                    │
│ Position: (10.50, 2.30, 0) │
│ Mesh: sphere                │
│                             │
│ Right-click elsewhere to    │
│ deselect this entity        │
└─────────────────────────────┘
```

## Systems Integration

The selection system integrates with existing systems through:

1. **EntitySelectionSystem**: Handles click events and raycasting
2. **SelectedComponentSystem**: Manages the `Selected` tag component
3. **Renderable Init System**: Registers renderable objects for raycasting

### Adding Selection to New Entities

When creating new renderable entities, they are automatically selectable if they have the `Renderable` component. No additional setup is required.

```typescript
import { addEntity, addComponent } from "bitecs";
import { Renderable, MeshRef, Position } from "@/components/components";

const entity$ = addEntity(world);
addComponent(world, entity$, Renderable);
MeshRef.ref[entity$] = "sphere"; // Any mesh ID
Position.x[entity$] = 10;
Position.y[entity$] = 5;
Position.z[entity$] = 0;

// This entity is now automatically selectable by clicking on it!
```

## Example: Selected Entity Logger

Here's a complete example of logging selected entity information:

```typescript
import { query } from "bitecs";
import { Position, Name, Selected } from "@/components/components";

let lastSelectedEntity: number | null = null;

export const selectedEntityLogger = (world: World): void => {
  // Query for entities with Selected component
  const selectedEntities = query(world, Selected);

  if (selectedEntities.length > 0) {
    const entity$ = selectedEntities[0];

    // Check if selection changed
    if (entity$ !== lastSelectedEntity) {
      console.log("New entity selected:", entity$);

      // Log properties
      if (Position.x[entity$] !== undefined) {
        console.log("  Position:", {
          x: Position.x[entity$],
          y: Position.y[entity$],
          z: Position.z[entity$],
        });
      }

      if (Name.value[entity$] !== undefined) {
        console.log("  Name:", Name.value[entity$]);
      }

      lastSelectedEntity = entity$;
    }
  } else if (lastSelectedEntity !== null) {
    console.log("Entity deselected");
    lastSelectedEntity = null;
  }
};
```

## Troubleshooting

### Entity not selectable?

1. Make sure the entity has the `Renderable` component
2. Verify the entity's mesh/object is actually visible in the scene
3. Check that you're using **right-click** (not left-click) to select entities
4. Make sure the raycaster can intersect with the object (some objects might be too small or far away)

### Selected component not appearing?

The `SelectedComponentSystem` runs in the scene sync system and automatically adds the component to the selected entity. Make sure this system is being called in your game loop.

### Panel not showing?

The Entity Selection Panel will only show when:
- An entity is selected (has the `Selected` component)
- The React UI is rendering (check that GameUI is mounted)

## API Reference

### EntitySelectionSystem

```typescript
type EntitySelectionSystem = {
  init: (scene: THREE.Scene) => void;
  update: () => void;
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
  getSelectedEntity: () => number | null;
  selectEntity: (entity$: number) => void;
  deselect: () => void;
  _registerRenderableObject: (entity$: number, object: THREE.Object3D) => void;
  _unregisterRenderableObject: (entity$: number) => void;
};
```

### SelectedComponentSystem

```typescript
type SelectedComponentSystem = {
  update: (world: World) => void;
};
```

## See Also

- [Components](../src/components/components.ts) - Definition of the Selected component
- [Entity Selection Example](../src/examples/entitySelectionExample.ts) - Code examples
- [GameUI](../src/ui/GameUI.tsx) - Main UI component that includes the selection panel
