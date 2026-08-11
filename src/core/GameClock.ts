import type { GameWorldContext } from "@/context";

import { logger } from "@/utils/logger";

/**
 * Game clock that maintains serializable time state for deterministic save/load.
 *
 * This clock separates:
 * - gameTime: The "current moment" in the game simulation (serializable for save/load)
 * - deltaTime: Time elapsed since last frame (not serialized, computed fresh each frame)
 *
 * The gameTime represents a logical timestamp that can be saved and restored,
 * allowing deterministic replay from any point in the simulation.
 */
export type GameClock = {
  /**
   * Get the current game time (seconds since simulation start).
   * This is the "logical now" that should be saved with game state.
   */
  getTime: () => number;

  /**
   * Get the time delta from the previous frame (seconds).
   */
  getDelta: () => number;

  /**
   * Update the clock with raw performance time.
   * This should be called once per frame with the browser's performance timestamp.
   *
   * @param rawTime - Raw performance timestamp in milliseconds
   */
  update: (rawTime: number) => void;

  /**
   * Set the game time directly (used for restore from save).
   * This advances gameTime to a previously saved value without accumulating delta.
   *
   * @param time - The game time to restore (seconds)
   */
  setTime: (time: number) => void;

  /**
   * Check if this is the first update since creation or last reset.
   */
  isInitialUpdate: () => boolean;

  /**
   * Reset the clock to initial state.
   */
  reset: () => void;
};

const INITIAL_TIME = 0;

/** Threshold in seconds to detect when requestAnimationFrame was paused (e.g., window hidden) */
const PAUSE_THRESHOLD = 1.0; // If delta > 1 second, assume page was paused

/** Maximum allowed delta time in seconds to prevent simulation jumps (fallback protection) */
const MAX_DELTA_TIME = 0.1; // 100ms maximum per frame

/**
 * Create a game clock that maintains serializable time state.
 *
 * @param initialTime - Optional starting time in seconds (default: 0)
 * @returns GameClock instance
 */
export const createGameClock = (world: GameWorldContext): GameClock => {
  world.gameTime = INITIAL_TIME; // The "logical now" - serializable
  let lastRawTime: number | null = null; // Raw timestamp from previous frame
  let deltaTime = 0; // Computed delta from last frame

  const reset = (): void => {
    world.gameTime = INITIAL_TIME;
    lastRawTime = null;
    deltaTime = 0;
  };

  return {
    getTime: (): number => world.gameTime,

    getDelta: (): number => deltaTime,

    update: (rawTimeMs: number): void => {
      const rawTime = rawTimeMs / 1000; // Convert to seconds

      if (lastRawTime === null) {
        // First update - initialize without computing delta
        lastRawTime = rawTime;
        deltaTime = 0;

        if (world.gameTime !== INITIAL_TIME) {
          logger.debug(
            { gameTime: world.gameTime, INITIAL_TIME },
            "GameClock: Starting from restored time",
          );
        }
        return;
      }

      // Compute delta from raw time
      const computedDelta = rawTime - lastRawTime;

      // Detect if requestAnimationFrame was paused (e.g., window hidden)
      // If delta is larger than threshold, reset reference time to prevent jumps
      if (computedDelta > PAUSE_THRESHOLD) {
        logger.debug(
          { computedDelta, threshold: PAUSE_THRESHOLD },
          "GameClock: Detected pause, resetting timing reference",
        );
        lastRawTime = rawTime;
        deltaTime = 0;
        return;
      }

      // Clamp delta to prevent occasional large jumps (fallback protection)
      deltaTime = Math.min(MAX_DELTA_TIME, Math.max(0, computedDelta));

      // Advance gameTime by the actual elapsed time
      if (!world.isPaused) {
        world.gameTime += deltaTime;
      }
      lastRawTime = rawTime;
    },

    setTime: (time: number): void => {
      // Validate - time should be in the past relative to gameTime
      // or we're intentionally rewinding/pausing
      if (time < 0) {
        logger.error({ time }, "GameClock: Negative time value");
      }

      // When restoring, we set gameTime directly
      // The next update() will compute delta from this new time
      const previousTime = world.gameTime;
      world.gameTime = time;

      logger.debug(
        { previousTime, newTime: time },
        "GameClock: Time restored from save",
      );

      // Mark that next update should be treated as initial (reset delta)
      lastRawTime = null;
    },

    isInitialUpdate: (): boolean => {
      return lastRawTime === null;
    },

    reset,
  };
};
