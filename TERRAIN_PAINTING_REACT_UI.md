# Terrain Painting with React UI

This document describes the React-based user interface for terrain painting, which replaces the previous DOM event listener approach.

## Overview

The terrain painting system now uses a React component (`TerrainPaintingControls`) that integrates seamlessly with the existing game UI. This provides:

- **Declarative state management**: Brush properties are stored in the game world context
- **Real-time feedback**: UI updates immediately when values change
- **Clean separation**: Painting logic is separated from React state management

## Architecture

### State Flow

```
React UI (TerrainPaintingControls)
    ↓ updates world context
Game World Context (terrainBrushMaterial, terrainBrushRadius, etc.)
    ↓ sceneSyncSystem reads context
TerrainPaintingManager.updateFromUI()
    ↓ updates painting system config
TerrainPaintingSystem
    ↓ uses config for painting
Mouse Events → Raycasting → Paint on Terrain
```

### Key Components

1. **Game World Context** (`src/context.ts`)
   - Stores terrain painting state: `terrainPaintingEnabled`, `terrainBrushMaterial`, `terrainBrushRadius`, `terrainBrushStrength`

2. **TerrainPaintingControls Component** (`src/ui/TerrainPaintingControls.tsx`)
   - React component that renders brush controls
   - Updates world context on user interaction

3. **TerrainPaintingManager** (`src/terrain/TerrainPaintingManager.ts`)
   - Singleton that coordinates between React UI and painting system
   - Provides centralized access to terrain painter

4. **Scene Sync System** (`src/scene/systems/sceneSyncSystem.ts`)
   - Reads world context and updates painting system config each frame

## UI Controls

### Brush Material Selector

Dropdown to select material type:

- **Bare Dirt**: Moderate absorption, normal flow
- **Grass**: High absorption, slower flow
- **Rocks**: Low absorption, faster flow

### Brush Size Slider

Range input (0.5 - 6.0 world units)

- Displays current size: "Brush Size: 2.0"

### Brush Strength Slider

Range input (10% - 100%)

- Displays current strength: "Brush Strength: 75%"

### Toggle Button

Enables/disables painting system

- Shows "Painting ON" or "Painting OFF"

### Clear Materials Button

Resets all terrain to bare dirt

## Usage

### How to Paint

1. **Right-click and drag** on the terrain to paint
2. Hold **Shift key** while right-clicking for continuous painting mode
3. Use the UI panel to adjust brush properties

### Keyboard Shortcuts

- **Shift + Right-click**: Enable painting mode
- **Right-click + Drag**: Paint with current brush

## Implementation Details

### Context State

```typescript
// Added to GameWorldContext:
terrainPaintingEnabled: boolean;
terrainBrushMaterial: "bareDirt" | "grass" | "rocks";
terrainBrushRadius: number;
terrainBrushStrength: number;
```

### Component Props

```typescript
type TerrainPaintingControlsProps = {
  world: GameWorldContext;
};
```

### Update Flow

1. User interacts with UI component
2. Component updates `world` context properties
3. `sceneSyncSystem` runs each frame
4. `sceneSyncSystem` calls `terrainPaintingManager.updateFromUI()` with current context values
5. Painting system config is updated
6. Mouse events use new config for painting

## Example: Adding New Brush Property

To add a new brush property (e.g., `brushOpacity`):

1. **Update context** (`src/context.ts`):

```typescript
terrainBrushOpacity: 1.0, // Add to createGameWorldContext
```

2. **Update component** (`src/ui/TerrainPaintingControls.tsx`):

```typescript
const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  world.terrainBrushOpacity = parseFloat(e.target.value);
};

// Add slider in JSX:
<input
  type="range"
  min="0.1"
  max="1.0"
  step="0.1"
  value={world.terrainBrushOpacity}
  onChange={handleOpacityChange}
/>
```

3. **Update manager type** (`src/terrain/TerrainPaintingManager.ts`):

```typescript
updateFromUI: (params: {
  // ... existing params
  brushOpacity: number;
}) => void;
```

4. **Update scene sync** (`src/scene/systems/sceneSyncSystem.ts`):

```typescript
terrainPaintingManager.updateFromUI({
  enabled: world.terrainPaintingEnabled,
  brushMaterial: world.terrainBrushMaterial,
  brushRadius: world.terrainBrushRadius,
  brushStrength: world.terrainBrushStrength,
  brushOpacity: world.terrainBrushOpacity, // Add this
});
```

## File Structure

```
src/
├── context.ts                          # Game world context with painting state
├── ui/
│   ├── TerrainPaintingControls.tsx    # React component for painting controls
│   └── GameUI.tsx                     # Main UI (includes TerrainPaintingControls)
├── terrain/
│   ├── TerrainPaintingManager.ts      # Manager coordinating UI and painting system
│   └── systems/
│       └── terrainPaintingSystem.ts   # Core painting logic (mouse events)
└── scene/
    └── systems/
        └── sceneSyncSystem.ts         # Syncs React state with painting system
```

## Benefits of React UI Approach

1. **Type Safety**: All brush properties are strongly typed through the context
2. **Reactive Updates**: UI automatically reflects current state
3. **Centralized State**: Single source of truth in game world context
4. **Easy Extension**: Adding new properties follows a clear pattern
5. **Debugging**: State changes are visible through React DevTools

## Troubleshooting

### Painting Not Working

1. Check that `terrainPaintingEnabled` is `true` in the context
2. Verify the painting system was initialized (check console for initialization logs)
3. Ensure camera and terrain mesh are set

### UI Not Updating

1. Check that the component receives the correct `world` prop
2. Verify React is re-rendering when context changes
3. Check browser console for errors

### Brush Properties Not Affecting Painting

1. Ensure `sceneSyncSystem` is being called each frame
2. Verify `terrainPaintingManager.updateFromUI()` is receiving correct values
3. Check that painting system config is being updated

## Future Enhancements

Potential improvements:

1. **Brush Preview**: Show brush size overlay on terrain
2. **Material Presets**: Save/load custom material combinations
3. **Undo/Redo**: Track painting history for undo functionality
4. **Color Picker**: Visual material selection instead of dropdown
5. **Brush Shape Selector**: Choose between circle, square, or custom brush shapes

## API Reference

### TerrainPaintingControls Props

```typescript
{
  world: GameWorldContext; // Required - game world context with painting state
}
```

### Context Properties

| Property                 | Type                               | Default      | Description                 |
| ------------------------ | ---------------------------------- | ------------ | --------------------------- |
| `terrainPaintingEnabled` | `boolean`                          | `true`       | Enable/disable painting     |
| `terrainBrushMaterial`   | `"bareDirt" \| "grass" \| "rocks"` | `"bareDirt"` | Current brush material      |
| `terrainBrushRadius`     | `number`                           | `2.0`        | Brush radius in world units |
| `terrainBrushStrength`   | `number`                           | `1.0`        | Painting strength (0-1)     |

## Conclusion

The React UI approach provides a clean, maintainable way to manage terrain painting state. The separation between UI components and core painting logic makes it easy to extend and debug while providing a responsive user experience.
