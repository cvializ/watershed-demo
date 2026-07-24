# Game Time and Save/Load Architecture

## Overview

This project uses a dual-time system that separates **absolute game time** (serializable for save/load) from **delta time** (frame-rate independent updates).

## Time Concepts

### Game Time (`gameTime`)
- **What it is**: The "logical now" - a timestamp representing current simulation time in seconds
- **Purpose**: Saved/restored with game state for deterministic replay
- ** Characteristics**: 
  - Serializable (can be saved to localStorage, sent over network, etc.)
  - Continuous incrementing value
  - Restored from save files to resume simulation

### Delta Time (`deltaTime`)
- **What it is**: Time elapsed since the previous frame in seconds
- **Purpose**: Used for all physics and animation updates
- **Characteristics**:
  - Computed fresh each frame from raw performance timestamps
  - Not serialized (reset when game loads)
  - Frame-rate independent

## Architecture Components

### GameClock (`src/core/GameClock.ts`)
```typescript
type GameClock = {
  getTime: () => number;        // Get current gameTime (serializable)
  getDelta: () => number;       // Get deltaTime for updates
  update: (rawTimeMs) => void;  // Called each frame with performance timestamp
  setTime: (time: number) => void; // Restore gameTime from save
  toJSON: () => GameClockState;   // Serialize for storage
  fromJSON: (state) => void;      // Deserialize from storage
};
```

### Loop Resource (`src/renderer/resources/loop.ts`)
The animation loop manages the global GameClock:

```typescript
createLoopResource((gameTime, deltaTime) => {
  // gameTime - serializable current time (seconds)
  // deltaTime - frame duration (seconds)
  
  worldSyncSystem(world, deltaTime);
  sceneSyncSystem(world, scene, deltaTime);
  rendererSyncSystem(world, scene, renderer, deltaTime);
});
```

## Save/Load Process

### Saving
1. Game clock serializes `gameTime` via `toJSON()`
2. ECS world components are serialized
3. All data stored to localStorage with separate keys:
   - `{key}-ecs` - ECS component data
   - `{key}-context` - World context (camera, settings)
   - `{key}-gameTime` - Game time for deterministic restore

### Loading
1. ECS world is deserialized
2. Context (camera, settings) is restored
3. **Game time is restored** via `setTime()`
   - This sets the simulation to resume from the saved moment
   - Delta time is reset for fresh frame calculations

## Usage in Systems

### Physics/Animation Updates
Always use delta time for rate-of-change calculations:

```typescript
// Update position: new = old + velocity * deltaTime
position += velocity * deltaTime;

// Update rotation: angle += angularVelocity * deltaTime  
rotation += angularVelocity * deltaTime;
```

### Save Point Logic
```typescript
// When saving:
const gameTime = gameClock.getTime(); // e.g., 123.456
gameClock.toJSON(); // { gameTime: 123.456 }

// When loading:
gameClock.fromJSON({ gameTime: 123.456 });
// Simulation continues from this point deterministically
```

## Deterministic Replay

The game clock enables deterministic replay because:

1. **Same initial state**: Load saved gameTime + ECS state
2. **Same updates**: All systems receive same deltaTime values (frame timing)
3. **No drift**: No reliance on wall-clock time that varies between runs

Example: Water simulation starts from saved position, flows identically regardless of when the save was made.

## Key Benefits

| Benefit | Explanation |
|---------|-------------|
| **Save/Load** | Restore exact simulation state including timing |
| **Determinism** | Same inputs produce same outputs every time |
| **Frame-rate independence** | Game runs at consistent speed regardless of frame rate |
| **Debugging** | Replay specific moments for debugging |
| **Network sync** | Send gameTime to synchronize clients |

## Migration from Old Code

If your code previously used absolute time directly:

```typescript
// OLD (problematic for save/load):
time += deltaTime;
position = Math.sin(time) * amplitude;

// NEW (game-time aware):
const gameTime = gameClock.getTime();
position = Math.sin(gameTime) * amplitude;
```

Or better yet, keep update functions pure:

```typescript
function updateEntity(entity: Entity, deltaTime: number): void {
  entity.rotation += entity.angularVelocity * deltaTime;
}
```

## Technical Notes

- Raw performance timestamps (ms) are converted to seconds internally
- Delta time is clamped to prevent negative values from timing hiccups
- Game clock is global and accessible via `getGameClock()` from any module