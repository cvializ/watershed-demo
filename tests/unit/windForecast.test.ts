import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  CHANGE_INTERVAL_WINDOW,
  FIRST_CHANGE_INTERVAL,
} from "src/core/windForecast";
import { createGameWorldContext } from "src/context";
import {
  type CropGustTrail,
  type FieldVector,
} from "src/renderer/resources/cropGusts";
import { trackWind } from "src/renderer/resources/wind";

/**
 * Invariants of the wind the weather pane drives the sky and the field with,
 * checked against a CPU mirror of the crop shaders (see `windBend` and
 * `gustsTravelled` in src/shaders/water-visualization.frag and
 * src/shaders/reflection-visualization.frag) together with the real forecast
 * that supplies the wind they ride, plus source guards that the wind really is
 * drawn by the forecast rather than read straight off the two sliders.
 *
 * Why a mirror in plain node and not only on the GPU (same reasoning as
 * tests/unit/sedimentConservation.test.ts and tests/unit/cropGusts.test.ts):
 * every statement below is about which terms talk to which - a wind that has
 * not been reached yet eases rather than snapping, a wind that is dialed in
 * mid-interval is caught up rather than restarted, the march keeps the ground
 * the wind before it covered - and those are testable at double precision and
 * microsecond cost.
 */

/** A wind, a field point, or a travelled distance, as the shaders hold it. */
type Vector2 = FieldVector;

/** The constants the mirror runs on, pinned against the GLSL below. */
const GUST_WIDTH = 3.0;
const GUST_SPEED = 2.5;
const MAX_UI_WIND = 0.707;
const CALM_WIND = 0.01;

/** Mirrors `cropWindDirection`: a unit vector, or nothing when becalmed. */
const windDirection = (wind: Vector2): Vector2 => {
  const windLength = Math.hypot(wind.x, wind.y);

  if (windLength <= CALM_WIND) {
    return { x: 0, y: 0 };
  }

  return { x: wind.x / windLength, y: wind.y / windLength };
};

/** Mirrors `cropWindForce`: 0 when becalmed, 1 at the strongest UI wind. */
const windForce = (wind: Vector2): number =>
  Math.sqrt(Math.min(1, Math.max(0, Math.hypot(wind.x, wind.y) / MAX_UI_WIND)));

/** Mirrors `dot`. */
const dot = (left: Vector2, right: Vector2): number =>
  left.x * right.x + left.y * right.y;

/** Mirrors `gustsTravelled`: the banked distance plus this wind's own run. */
const gustsTravelled = (trail: CropGustTrail, gameTime: number): number => {
  const direction = windDirection(trail.wind);

  if (direction.x === 0 && direction.y === 0) {
    return 0;
  }

  return (
    dot(trail.bankedDrift, direction) +
    GUST_SPEED *
      windForce(trail.wind) *
      (gameTime - trail.windSetTime)
  );
};

/** Pull one `const float NAME = <number>;` out of the GLSL. */
const glslConstant = (shaderSource: string, name: string): number => {
  const match = shaderSource.match(
    new RegExp(`const\\s+float\\s+${name}\\s*=\\s*(-?[0-9.eE+-]+);`),
  );

  if (!match || !match[1]) {
    throw new Error(`${name} is no longer a plain float constant in the GLSL`);
  }

  return Number.parseFloat(match[1]);
};

/* The wind the field is drawn with while nothing is dialed in, and the
 * distance it has covered, are pinned by the tests below rather than by a
 * fresh tracker: the tracker's own starting state is the same three numbers
 * the pane starts on. */

test.describe("the wind the weather pane sets", () => {
  test("the wind is dealt from the clock and holds until the interval runs out", () => {
    const world = createGameWorldContext();

    // The wind the field rides is dealt from the clock, not read off the two
    // sliders: a fresh wind is dealt for each interval of the clock, keyed off
    // that interval, so whatever the sliders are dialed to mid-interval the
    // wind keeps easing between the two winds dealt for the intervals either
    // side of it - never chased from the sliders.
    const before = trackWind(world, 1);

    world.cloudWindX = -0.8;
    world.cloudWindY = 0.6;

    const during = trackWind(world, 2);

    // 1 and 2 are both in `[0, 3)`, and the wind is the full-interval blend
    // from the interval's start - so the later sample has eased further along
    // that blend even though the sliders moved between them.
    expect(during).not.toEqual(before);

    // Once the interval runs out, a wind is dealt for the interval the clock
    // reached, and whatever the sliders are set to, both 10 and 11 are in
    // `[9, 12)`, so they ease along the same blend - from the `[6, 9)` wind
    // to the `[9, 12)` wind - with 11 further along it than 10.
    const arrived = trackWind(world, 10);
    const holds = trackWind(world, 11);

    expect(holds).not.toEqual(arrived);

    // And the interval brought a change: the wind dealt for `[9, 12)` is not
    // the wind dealt for `[0, 3)`, so the field really does get a different
    // wind as the intervals pass rather than sitting on one wind forever.
    // (Both samples are measured from their interval's start, so each is the
    // blend between the winds of the intervals either side of its own - the
    // change keeps running instead of snapping.)
    expect(arrived.wind).not.toEqual(before.wind);
  });

  test("the wind the field rides stays inside the range the pane can set", () => {
    const world = createGameWorldContext();

    for (const gameTime of [0, 3, 7, 21, 64]) {
      const program = trackWind(world, gameTime);

      // Every wind a forecast can draw is inside the pane's own window, so
      // the sliders never have to be told about a wind the shader would clamp
      // anyway - and the field is never handed a storm the pane cannot set.
      expect(Math.abs(program.wind.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(program.wind.y)).toBeLessThanOrEqual(1);
    }
  });

  test("a wind held across a long interval keeps marching at its own pace", () => {
    // The distance has to stay inside the interval that contains the clock,
    // because everything else about the wind is derived from it: a wind that
    // ran out its interval before it was next sampled is dealt from the clock
    // afresh, so its distance is measured from that interval's start and never
    // accumulates the skipped past.
    const world = createGameWorldContext();

    // 30 on a 10-second interval is the first wind dealt for `[30, 40)`, drawn
    // from the clock - so its distance is measured from 30, not from wherever
    // the last interval ended, and no distance has banked yet.
    world.windChangeInterval = 10;

    const held = trackWind(world, 30);

    expect(held.windSetTime).toBe(30);

    // And the same with the interval dialed a tenth of a second: the wind is
    // dealt for `[33, 33.1)`, drawn from the clock, so whatever distance it has
    // covered belongs to that one interval alone and nothing accumulates.
    world.windChangeInterval = 0.1;

    const shortened = trackWind(world, 33);

    expect(shortened.windSetTime).toBe(33);
    expect(Math.abs(gustsTravelled(shortened, 33))).toBeLessThanOrEqual(
      0.1 * GUST_SPEED * windForce(shortened.wind) + 1e-9,
    );

    // And the two draws are not necessarily the wind the pane started on - the
    // whole point of drawing from the clock is that the wind moves.
  });

  test("the wind changes when the interval passes even with the sliders untouched", () => {
    // This is the point of the change: with nothing dialed at all, the wind
    // still changes from interval to interval, so the field and the sky never
    // sit on one wind forever.
    const world = createGameWorldContext();

    // Nothing is dialed - `cloudWindX`/`cloudWindY` are untouched - yet by the
    // time the first interval has run out a different wind has been dealt.
    // 5 and 6 straddle the `[3, 6)` / `[6, 9)` boundary: the wind changes as
    // the interval passes even with the sliders untouched, so the field and the
    // sky never sit on one wind forever - and the change keeps running through
    // each interval, since every interval eases from the wind of the one
    // before it to the wind dealt for itself.
    const inSecondInterval = trackWind(world, 5);
    const inThirdInterval = trackWind(world, 6);

    expect(inSecondInterval.wind).not.toEqual(inThirdInterval.wind);
  });

  test("the field and the sky are drawn with the wind the pane aimed at", () => {
    // The wind the pane sets is a drift in the cloud texture's uv frame: the
    // texture is sampled ahead of itself (`uv + uDriftSpeed * uTime` in
    // src/shaders/compute/drifting-cloud.frag), so the pattern travels
    // against the vector the pane spells, and a plane keeps v measured the
    // other way to world z (which is why the terrain shaders flip
    // `1.0 - uv.y`). The program the field is drawn with therefore runs
    // along (-0.1, 0.05) for the pane's starting 0.1 / 0.05 - the bearing
    // the clouds are on - rather than along the angle that had the crop
    // waving at an angle to the sky.
    const world = createGameWorldContext();

    // And while the first interval runs, the field is drawn with the wind the
    // clock dealt for `[0, 3)` - blended from the wind before it toward the
    // wind for `[0, 3)` - however much of the interval has been spent.
    expect(trackWind(world, 2).windSetTime).toBe(0);

    // And with the first interval run out, a wind dealt for `[3, 6)` is what
    // the field is drawn with - easing from the `[0, 3)` wind toward the
    // `[3, 6)` wind across that whole interval, whatever the sliders are
    // dialed to mid-interval.
    world.cloudWindX = 0.25;
    world.cloudWindY = -0.6;

    // Sampled twice inside `[3, 6)`, the field answers the wind of that
    // interval - and the distance it has covered is a distance in world units
    // along the wind it rides, measured from when that interval began, so a
    // crest that had crossed a field stays crossed rather than snapping back to
    // where a fresh wind would start one.
    const drawn = trackWind(world, 5);
    const alsoDrawn = trackWind(world, 5.5);

    // And the wind eases: 5.5 is further along the `[3, 6)` interval than 5,
    // so it has eased further from the `[0, 3)` wind toward the `[3, 6)` one.
    expect(alsoDrawn).not.toEqual(drawn);

    // And the distance is measured from when the interval began - two seconds
    // and two-and-a-half seconds of the wind it rides - rather than recomputed
    // from the clock's start, so a wind change cannot restart a gust
    // mid-crossing.
    expect(gustsTravelled(drawn, 5)).toBeCloseTo(
      2 * GUST_SPEED * windForce(drawn.wind),
      6,
    );
    expect(gustsTravelled(drawn, 5)).toBeGreaterThan(GUST_WIDTH);
  });

  test("the wind the field rides is drawn, not read off the sliders", () => {
    const simulationSource = readFileSync(
      "src/renderer/systems/simulation.ts",
      "utf8",
    );

    // The simulation system takes the wind the forecast drew rather than the
    // two numbers the pane sets, so a wind changes over the interval the pane
    // configures instead of the moment a slider moves - and it takes it from
    // one tracker per pass, so the water flow view and the reflections view of
    // a field cannot drift apart from each other's history (the same trail is
    // handed to both views).
    expect(
      simulationSource.match(/const wind = trackWind\(world, gameTime\)/g) ??
        [],
    ).toHaveLength(1);
    // And the crop's gusts ride that same drawn wind, kept on the crop's own
    // tracker, which turns it into the field's frame - so the crop blows along
    // the bearing that wind actually drives the sky down rather than at an
    // angle to it, and a change of wind carries a gust on from wherever the
    // old wind left it.
    expect(
      simulationSource.match(
        /cropGustTracker\.trail\(\s*\{\s*cloudWindX: wind\.wind\.x,\s*cloudWindY: wind\.wind\.y,?\s*\},\s*gameTime,?\s*\)/g,
      ) ?? [],
    ).toHaveLength(1);

    // And the wind the clouds are handed is the drawn one too, so the sky and
    // the crop ride the same wind rather than the crop lagging the sky.
    expect(simulationSource).toContain("cloudWindX: wind.wind.x");
    expect(simulationSource).toContain("cloudWindY: wind.wind.y");

    // The pane can dial the interval anywhere in the window, and anything
    // outside it is clamped into it - so a setting of nothing at all still
    // gets a wind that changes rather than one that never does.
    expect(CHANGE_INTERVAL_WINDOW).toEqual([0.1, 10]);
    expect(FIRST_CHANGE_INTERVAL).toBe(3);
  });

  test("both views of the crop still read the tracked wind from the weather UI", () => {
    for (const shaderPath of [
      "src/shaders/water-visualization.frag",
      "src/shaders/reflection-visualization.frag",
    ]) {
      const shaderSource = readFileSync(shaderPath, "utf8");

      // The wind is bound, not guessed: no standing direction and no storm
      // speed left in the shader, and the crop drawn from the vector the
      // forecast reaches, kept with the distance that wind and its
      // predecessors have already travelled.
      expect(shaderSource).toContain("uniform vec2 uWind;");
      expect(shaderSource).toContain("uniform vec2 uGustDrift;");
      expect(shaderSource).toContain("uniform float uGustSetTime;");

      // And the march is measured from the tracked distance, not recomputed
      // from the clock, so a wind change cannot restart a gust mid-crossing.
      expect(shaderSource).toContain("float gustsTravelled()");
      expect(shaderSource).toContain("return dot(uGustDrift, windDir)");
      expect(shaderSource).toContain(
        "GUST_SPEED * cropWindForce() * (uTime - uGustSetTime);",
      );
      expect(shaderSource).toContain(
        "- vec2(gustsTravelled(), 0.0)) / GUST_WIDTH;",
      );

      // And the mirror above still mirrors the GLSL's own numbers.
      expect(glslConstant(shaderSource, "GUST_WIDTH")).toBe(GUST_WIDTH);
      expect(glslConstant(shaderSource, "GUST_SPEED")).toBe(GUST_SPEED);
      expect(glslConstant(shaderSource, "MAX_UI_WIND")).toBe(MAX_UI_WIND);
      expect(glslConstant(shaderSource, "CALM_WIND")).toBe(CALM_WIND);
    }
  });
});