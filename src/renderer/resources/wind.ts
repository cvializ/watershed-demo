import type { GameWorldContext } from "@/context";

import {
  CHANGE_INTERVAL_WINDOW,
  STARTING_WIND,
  trackWindFromClock,
  type WindTrail,
} from "@/core/windForecast";

/**
 * Where the gusts over the crop and the drift across the sky stand: the wind
 * drawn from the clock rather than read off the two sliders, kept on the same
 * three tracked values the crop is kept on - the wind, how far everything
 * before it has travelled along that wind, and when it was drawn - so that a
 * change of wind carries a gust on from wherever the old wind left it instead
 * of restarting it, and the wind actually changes over the interval the pane
 * sets instead of sitting on whatever the sliders were last aimed at.
 *
 * Every interval of the clock is dealt its own wind, drawn from a seed keyed
 * off that interval. Two samples inside one interval answer the same wind and
 * the same distance; a clock that ran past an interval before it was next
 * sampled is dealt the wind of the interval it reached, so nothing is ever
 * measured against a wind stranded in the past.
 */

/**
 * The forecast currently on hand. A fresh one answers the wind the pane starts
 * on, so the first render already has a wind to be easing toward rather than a
 * horizon that ran out before anything was drawn.
 */
let forecastOnHand = STARTING_WIND;

export const trackWind = (
  world: GameWorldContext,
  gameTime: number,
): WindTrail => {
  const interval = Math.min(
    CHANGE_INTERVAL_WINDOW[1],
    Math.max(CHANGE_INTERVAL_WINDOW[0], world.windChangeInterval),
  );

  const trail = trackWindFromClock(forecastOnHand, interval, gameTime);

  // Next time round, hold this wind from when it was drawn.
  forecastOnHand = {
    wind: trail.wind,
    intervalStart: trail.windSetTime,
    interval,
  };

  return trail;
};