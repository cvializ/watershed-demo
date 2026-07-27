import type { GameWorldContext } from "@/context";

import { createGameClock, type GameClock } from "@/core/GameClock";

export type LoopFunction = (t: number, dt: number) => void;

/**
 * Global reference to the game clock for save/load functionality.
 * This is set when createLoopResource is called.
 */
let globalGameClock: GameClock | null = null;

/**
 * Get the global game clock instance.
 * Useful for save/load operations that need to serialize game time.
 */
export const getGameClock = (): GameClock | null => globalGameClock;

/**
 * Create an animation loop that uses a serializable game clock.
 *
 * The clock gameTime is the "logical now" that can be saved with game state.
 * The raw time from requestAnimationFrame drives delta computation.
 *
 * @param cb - Callback receiving (gameTime, deltaTime) in seconds
 * @returns Object with loop control methods and clock reference
 */
export const createLoopResource = (
  world: GameWorldContext,
  cb: LoopFunction,
) => {
  // Create or reuse the global game clock
  if (!globalGameClock) {
    globalGameClock = createGameClock(world);
  }

  const gameClock = globalGameClock;

  // --- Animation Loop ---
  const animate: FrameRequestCallback = (rawTimeMs) => {
    // Update clock with raw performance time (milliseconds)
    gameClock.update(rawTimeMs);

    // Pass serializable gameTime and computed deltaTime to callback
    cb(gameClock.getTime(), gameClock.getDelta());

    requestAnimationFrame(animate);
  };

  // Start the loop
  requestAnimationFrame(animate);

  return {
    clock: gameClock,
    stop: () => {}, // Placeholder - loop continues until component unmounts
  };
};
