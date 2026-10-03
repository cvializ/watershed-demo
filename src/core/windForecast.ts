/**
 * A wind drawn from the clock.
 *
 * The wind the field and the sky ride is not read straight off the two sliders
 * in the weather pane: it is drawn from a deterministic per-interval seed, so
 * as the clock crosses each `windChangeInterval` boundary a fresh wind is dealt
 * out - eased out of the wind it replaces across the whole interval rather than
 * taken all at once - and that wind holds for the rest of the interval it was
 * drawn for. Nothing dialled in the pane mid-interval is chased; the wind
 * simply waits for its interval to run out, then changes over.
 *
 * The draw is seeded from the clock rather than taken from `Math.random`, so
 * the same interval always answers the same wind however late or often it is
 * sampled, and a clock that jumped past an interval gets the wind of the
 * interval it reached, not a wind stranded in the past.
 */

/** The window the pane's own interval slider is clamped into: at least a
 * tenth of a second between changes, at most ten seconds. */
export const CHANGE_INTERVAL_WINDOW: [number, number] = [0.1, 10];

/** The interval the pane starts on: three seconds between wind changes. */
export const FIRST_CHANGE_INTERVAL = 3;

/** The window each wind component is dealt within - the pane's own slider
 * range, so a drawn wind is on the same scale as the two sliders. */
const WIND_COMPONENT_WINDOW: [number, number] = [-1, 1];

/** A wind, as the pane spells it and as the crop spells it: a drift along two
 * axes. `wind` is the wind itself; `bankedDrift` is the distance travelled
 * already, measured along the wind it belongs to, so a change of wind carries
 * an existing pattern on. `windSetTime` is when that wind was drawn - the
 * origin of its distance. `windFrom` and `targetWind` are the two winds being
 * interpolated between while a change is on, and `transitionStart` is where
 * that interpolation began - so a wind keeps easing from its true predecessor
 * rather than out of whatever half-blend was last sampled. */
export type WindTrail = {
  wind: { x: number; y: number };
  bankedDrift: { x: number; y: number };
  windSetTime: number;
  /** The wind being interpolated from, the wind being interpolated into, and
   * where that interpolation began - so a wind keeps easing from its true
   * predecessor rather than out of whatever half-blend was last sampled. */
  windFrom: { x: number; y: number };
  targetWind: { x: number; y: number };
  transitionStart: number;
};

/** A wind as drawn from the clock: its two numbers, and the interval of the
 * clock it was drawn for - everything about the wind is measured from the
 * start of that interval, so a wind is never sampled after its interval has
 * run out, and is always drawn from the interval the clock has reached.
 * `targetWind` is the wind being interpolated into, and `transitionStart` is
 * where the interpolation of the two began on the clock - both unchanged while
 * one wind holds, and both set afresh when an interval runs out and the next
 * wind starts easing in. */
type WindFromClock = {
  /** Where the wind points, in the same frame the pane sets it in - uv x and
   * uv y, with the crop to come behind the field measured along these. While
   * a change is being interpolated this is the blend between `wind`'s
   * predecessor and `targetWind` at the last sampled instant. */
  wind: { x: number; y: number };
  /** The wind that was drawn for the interval on hand - what the wind being
   * interpolated into, below, is being interpolated from. Same object as
   * `wind` while one wind holds. */
  windFrom: { x: number; y: number };
  /** The wind dealt out for the interval on hand - what `wind` is easing
   * into, and what it becomes once the interpolation is spent. */
  targetWind: { x: number; y: number };
  /** Where the interpolation from `windFrom` to `targetWind` began, on the
   * clock - the interval boundary that dealt `targetWind`. */
  transitionStart: number;
  /** Where the wind on hand's interval began, on the clock. */
  intervalStart: number;
  /** How long this wind's interval runs for. */
  interval: number;
};

/** The wind the field starts on: nothing much, along -x and a little +y. */
export const STARTING_WIND: WindFromClock = {
  wind: { x: 0.1, y: 0.05 },
  windFrom: { x: 0.1, y: 0.05 },
  targetWind: { x: 0.1, y: 0.05 },
  transitionStart: 0,
  intervalStart: 0,
  interval: 3,
};

/**
 * A deterministic hash of `str` into the unit interval, from the same idea as
 * the GLSL hash functions in this project's shaders - enough to spread a seed
 * across `[0, 1)` without needing a PRNG to be threaded through every call.
 */
const hashUnit = (str: string): number => {
  // FNV-1a over the characters, folded into 32 bits, then mapped into the unit
  // interval. Deterministic and stable across runs, so a wind drawn for the
  // interval `[9, 12)` on a 3-second stride is dealt the same way every time.
  let hash = 2166136261;

  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // Fold the signed hash into an unsigned value, then take the fractional part
  // of a scaled version to get a value in `[0, 1)`.
  const unsigned = hash >>> 0;

  return (unsigned % 100000) / 100000;
};

/**
 * A wind dealt out for a given clock stride: a deterministic point inside the
 * window the pane's two sliders allow, keyed off the interval it was drawn for
 * so the same interval always answers the same wind and a later interval always
 * answers a different one.
 */
const drawWindWithin = (
  /** Which interval of the clock to draw for - everything about the wind is
   * keyed off this, so an interval that ran out while unsampled gets the same
   * wind it would have been dealt had the clock been sampled on time. */
  strideStart: number,
  /** How long an interval runs, so the seed changes with the interval and not
   * merely with the instant inside it. */
  interval: number,
  /** The window each component is drawn within - the pane's own `[min, max]`. */
  window: [number, number],
): { x: number; y: number } => {
  const [low, high] = window;
  // Seed off the interval itself, so every sample inside one interval draws the
  // same wind and every interval draws its own.
  const seed = `w:${strideStart}:${interval}`;

  return {
    x: low + hashUnit(`${seed}:x`) * (high - low),
    y: low + hashUnit(`${seed}:y`) * (high - low),
  };
};

/**
 * The wind to draw at `gameTime` from `world`'s two slider values and its
 * `intervalLength`.
 *
 * A wind on hand holds until its interval is up, and only then is the next one
 * dealt out - a fresh point inside the window the pane allows, keyed off the
 * interval of the clock it is drawn for. So the wind to draw is the wind from
 * the last interval if the clock is still within it, and a fresh wind dealt for
 * the interval the clock reached if not - with the distance to it measured from
 * the start of that interval, so a wind that ran out while unsampled never
 * banks the skipped past and a wind sampled twice answers the same distance.
 *
 * And the change between two intervals' winds is eased rather than taken all
 * at once: across the whole interval the clock has reached, the wind answers
 * the blend between the old wind and the one dealt for that interval, weighted
 * by how far through the interval the clock sits - so the change is spread over
 * the entire interval instead of happening all at once at the boundary.
 * Sampling from the interval's own start keeps this deterministic: a wind dealt
 * for `[3, 6)` is half-blended into its predecessor at 4.5 and is fully the
 * new wind only as that interval runs out.
 */
export const trackWindFromClock = (
  /** Kept for interface stability - everything needed to place the change
   * (the wind of the clock's interval and of the interval before it) is
   * dealt fresh from the clock, so nothing has to be carried over from the
   * last sample. */
  _onHand: WindFromClock,
  /** How long an interval runs at the setting the pane is on. */
  interval: number,
  /** Where the clock stands. */
  gameTime: number,
): WindTrail => {
  // Whichever interval the clock lands in is found by rounding down to the
  // interval - so a wind drawn before the clock jumped into a later interval
  // is caught up to that interval's start, and never measured from before then.
  // (Rounded to an integer, since float products like `0.1 * 30` land just
  // short of the exact boundary and would otherwise re-deal the same wind.)
  const strideStart = Math.round(Math.floor(gameTime / interval) * interval);

  // The two winds to interpolate between are dealt fresh from the interval
  // *before* this one and the interval the clock reached - each keyed off its
  // own interval - rather than carried over from the last sample. So whatever
  // instants of an interval get sampled, the wind always runs from the true
  // wind of the previous interval to the true wind of this one, placed by
  // where the clock actually sits inside the interval.
  const targetWind = drawWindWithin(strideStart, interval, WIND_COMPONENT_WINDOW);
  const windFrom =
    strideStart === 0
      ? STARTING_WIND.wind
      : drawWindWithin(
          Math.round(strideStart - interval),
          interval,
          WIND_COMPONENT_WINDOW,
        );

  // The change of wind runs across the whole interval: from the wind dealt
  // for the interval before the clock's, to the wind dealt for the clock's
  // interval, placed by where the clock actually sits inside that interval -
  // computed fresh every call from those true endpoints, so successive samples
  // show the change progressing rather than easing out of a half-blend.
  // A clock sampled partway into a later interval (after its previous
  // interval ran out while unsampled) starts easing from the start of the
  // interval it reached, so the change keeps its full interval even across
  // skipped clocks.
  const throughInterpolation = Math.min(interval, gameTime - strideStart);
  const weight = throughInterpolation / interval;

  const eased = {
    x: windFrom.x + (targetWind.x - windFrom.x) * weight,
    y: windFrom.y + (targetWind.y - windFrom.y) * weight,
  };

  // Same place in the interpolation for the same clock, whether or not the
  // wind on hand was dealt for this interval.
  return {
    wind: eased,
    bankedDrift: { x: 0, y: 0 },
    windFrom,
    targetWind,
    transitionStart: strideStart,
    windSetTime: strideStart,
  };
};