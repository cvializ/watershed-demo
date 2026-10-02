import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createCropGustTracker,
  type CropGustTrail,
  type FieldVector,
} from "src/renderer/resources/cropGusts";

/**
 * Invariants of the gusts over the cultivated field, checked against a CPU mirror of
 * the shader code (see windBend in src/shaders/water-visualization.frag and
 * src/shaders/reflection-visualization.frag) together with the real tracker that
 * supplies the wind they ride, plus source guards that the wind really is taken from
 * the weather pane rather than guessed.
 *
 * Why a mirror in plain node and not only on the GPU (same reasoning as
 * tests/unit/sedimentConservation.test.ts): every statement below is about which
 * terms talk to which - calm wind stills the crop, a harder wind swings it further, a
 * gust stays pinned to the ground while the wind carries it, the whole field mirrors
 * when the wind is reversed, and a field that has been blowing in one direction keeps
 * the ground the wind before it covered - and those are testable at double precision
 * and microsecond cost. The last two blocks keep the mirror honest: they read the
 * GLSL text, so a shader that quietly goes back to a standing wind, to a direction the
 * weather pane cannot set, or to a march recomputed from the clock, fails instead of
 * waving at an angle to the clouds.
 */

/** A wind, a field point, or a travelled distance, as the shaders hold it in a `vec2`. */
type Vector2 = FieldVector;

/** The constants the mirror runs on, pinned against the GLSL below. */
const GUST_WIDTH = 3.0;
const GUST_SPEED = 2.5;
const MAX_UI_WIND = 0.707;
const CALM_WIND = 0.01;
const STALK_WIDTH = 0.75;
const TWO_PI = 6.2831853;

/** The three tones of the crop, as the shaders pick them: the shade between
 * the stalks, the swatch the field was painted with, and the pale silver of a
 * gust that lays the field flat. */
const STALK_SHADE: [number, number, number] = [0.45, 0.37, 0.2];
const STANDING_GRAIN: [number, number, number] = [0.86, 0.8, 0.4];
const WIND_SILVER: [number, number, number] = [0.95, 0.9, 0.66];

/**
 * The wind the weather pane starts on, already turned into the field's frame: the
 * pane's 0.1 / 0.05 is a drift in the cloud texture's uv frame, the crop's pattern
 * sits behind that drift, and the texture's v runs against world z.
 */
const DEFAULT_FIELD_WIND: Vector2 = { x: -0.1, y: 0.05 };

/** A wind the field has ridden ever since the clock started, with nothing banked yet. */
const trailFor = (wind: Vector2): CropGustTrail => ({
  wind,
  bankedDrift: { x: 0, y: 0 },
  windSetTime: 0,
});

/** Mirrors `hash21`. */
const hash21 = (lattice: Vector2): number => {
  const product =
    Math.sin(lattice.x * 127.1 + lattice.y * 311.7) * 43758.5453123;
  return product - Math.floor(product);
};

/** Mirrors `valueNoise`. */
const valueNoise = (point: Vector2): number => {
  const cell = { x: Math.floor(point.x), y: Math.floor(point.y) };
  const within = { x: point.x - cell.x, y: point.y - cell.y };
  const quintic = (fraction: number): number =>
    fraction ** 3 * (fraction * (fraction * 6 - 15) + 10);
  const fade = { x: quintic(within.x), y: quintic(within.y) };
  const mix = (from: number, to: number, weight: number): number =>
    from + (to - from) * weight;

  return mix(
    mix(
      hash21({ x: cell.x, y: cell.y }),
      hash21({ x: cell.x + 1, y: cell.y }),
      fade.x,
    ),
    mix(
      hash21({ x: cell.x, y: cell.y + 1 }),
      hash21({ x: cell.x + 1, y: cell.y + 1 }),
      fade.x,
    ),
    fade.y,
  );
};

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

/**
 * Mirrors `gustsTravelled`: the distance the winds before this one banked, measured
 * along the wind the crop rides now, plus this wind's own distance since it was set -
 * so the field is never handed a fresh pattern because someone moved a slider.
 */
const gustsTravelled = (trail: CropGustTrail, gameTime: number): number => {
  const direction = windDirection(trail.wind);

  if (direction.x === 0 && direction.y === 0) {
    return 0;
  }

  return (
    dot(trail.bankedDrift, direction) +
    GUST_SPEED * windForce(trail.wind) * (gameTime - trail.windSetTime)
  );
};

/** Mirrors `windBend`. */
const windBend = (
  field: Vector2,
  trail: CropGustTrail,
  gameTime: number,
): number => {
  const strength = windForce(trail.wind);
  if (strength <= 0) {
    return 0;
  }

  const direction = windDirection(trail.wind);
  const across = { x: -direction.y, y: direction.x };
  const travelled = gustsTravelled(trail, gameTime);
  const gustUv = {
    x: (dot(field, direction) - travelled) / GUST_WIDTH,
    y: dot(field, across) / GUST_WIDTH,
  };

  const train = Math.sin(gustUv.x * TWO_PI);
  const patchiness = valueNoise({ x: gustUv.x, y: gustUv.y + 4.31 });
  const stagger = Math.sin((gustUv.y * 0.8 + gustUv.x * 0.5) * TWO_PI);

  return strength * (0.7 * train * (0.35 + 0.65 * patchiness) + 0.3 * stagger);
};

/** Mirrors `cropColor`: the stand swings either side of the colour that was
 * painted, from the shade between the stalks to the silver of a laid field. */
const cropColor = (
  field: Vector2,
  trail: CropGustTrail,
  gameTime: number,
): [number, number, number] => {
  const bend = windBend(field, trail, gameTime);
  const cropTone = (channel: number): number =>
    bend < 0
      ? STANDING_GRAIN[channel] +
        (STALK_SHADE[channel] - STANDING_GRAIN[channel]) * -bend
      : STANDING_GRAIN[channel] +
        (WIND_SILVER[channel] - STANDING_GRAIN[channel]) * bend;

  // Heads a fraction of a unit apart, each catching the light a little
  // differently: displaced along the wind as the stalks bend, and dragged
  // through the pattern at a quarter of the distance the wind has covered.
  const direction = windDirection(trail.wind);
  const alongWind = bend * STALK_WIDTH - 0.25 * gustsTravelled(trail, gameTime);
  const headLight =
    0.88 +
    0.24 *
      valueNoise({
        x: field.x / STALK_WIDTH + direction.x * alongWind,
        y: field.y / STALK_WIDTH + direction.y * alongWind,
      });

  return [
    cropTone(0) * headLight,
    cropTone(1) * headLight,
    cropTone(2) * headLight,
  ];
};

/** A grid of field points spread over most of the valley. */
const fieldSweep = (): Vector2[] => {
  const points: Vector2[] = [];
  for (let column = 0; column <= 24; column++) {
    for (let row = 0; row <= 24; row++) {
      points.push({ x: column * 1.37 - 16, y: row * 1.13 - 12 });
    }
  }
  return points;
};

/** Widest swing of the crop over a field sweep at one instant. */
const widestSwing = (trail: CropGustTrail, gameTime: number): number =>
  Math.max(
    ...fieldSweep().map((field) => Math.abs(windBend(field, trail, gameTime))),
  );

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

test.describe("gusts over the cultivated crop", () => {
  test("a dead calm leaves the stand on the colour that was painted", () => {
    // Both a wind that was never set and one that died away on its own leave
    // the field upright: the first has no direction at all, and the second has
    // nothing left to blow - the distance it covered stays banked, unused.
    const neverSet: CropGustTrail = {
      wind: { x: 0, y: 0 },
      bankedDrift: { x: 0, y: 0 },
      windSetTime: 42,
    };
    const diedAway: CropGustTrail = {
      wind: { x: 0, y: 0 },
      bankedDrift: { x: -12.5, y: 6.25 },
      windSetTime: 12,
    };

    for (const becalmed of [neverSet, diedAway]) {
      for (const field of fieldSweep()) {
        expect(windBend(field, becalmed, 42)).toBe(0);

        // With nothing to bend it, every channel sits on the swatch, so the
        // field stays recognisably the crop that was painted: no point drifts
        // off that colour while the wind lies.
        const colour = cropColor(field, becalmed, 42);
        expect(colour[0] / STANDING_GRAIN[0]).toBeCloseTo(
          colour[1] / STANDING_GRAIN[1],
          10,
        );
        expect(colour[0] / STANDING_GRAIN[0]).toBeCloseTo(
          colour[2] / STANDING_GRAIN[2],
          10,
        );
      }
    }
  });

  test("a gust swings the crop either side of the colour that was painted", () => {
    // A wind on keeps every point of the field between the shade between the
    // stalks and the silver of a laid field, with the painted swatch as the
    // mid-tone: a gust darkens the crop into the shade as it springs back
    // through vertical and lightens it to silver as it lays it over.
    const gale = trailFor({ x: -0.5, y: -0.5 });

    for (const field of fieldSweep()) {
      const bend = windBend(field, gale, 42);

      for (const channel of [0, 1, 2] as const) {
        const tone =
          bend < 0
            ? STANDING_GRAIN[channel] +
              (STALK_SHADE[channel] - STANDING_GRAIN[channel]) * -bend
            : STANDING_GRAIN[channel] +
              (WIND_SILVER[channel] - STANDING_GRAIN[channel]) * bend;

        // Whatever the height above upright, the tone stays inside the ramp
        // between the two outer tones.
        expect(tone).toBeGreaterThanOrEqual(STALK_SHADE[channel] - 1e-9);
        expect(tone).toBeLessThanOrEqual(WIND_SILVER[channel] + 1e-9);
      }

      // And some of the field is clearly lighter than the swatch, so a gust is
      // a band one can see coming.
      expect(Math.abs(bend)).toBeLessThanOrEqual(1);
    }

    const lightest = Math.max(
      ...fieldSweep().map((field) => Math.abs(windBend(field, gale, 42))),
    );
    expect(lightest).toBeGreaterThan(0.5);
  });

  test("the crop swings further the harder the wind is set", () => {
    const lightBreeze = widestSwing(trailFor(DEFAULT_FIELD_WIND), 42);
    const gale = widestSwing(trailFor({ x: -0.5, y: -0.5 }), 42);

    expect(lightBreeze).toBeGreaterThan(0);
    expect(lightBreeze).toBeLessThan(1);
    expect(gale).toBeGreaterThan(lightBreeze * 1.5);
  });

  test("a gust stays pinned to the field while the wind carries it along", () => {
    const trail = trailFor({ x: 0.3, y: -0.4 });
    const direction = windDirection(trail.wind);
    // Twenty-two seconds on, a gust has travelled this far and so shows the
    // same bend it showed at the point upwind of it: the pattern travels
    // across the ground rather than sitting still while time passes, and it
    // does so at a pace the wind sets.
    const travelled = 22 * GUST_SPEED * windForce(trail.wind);

    for (const field of fieldSweep()) {
      const earlier = windBend(field, trail, 5);
      const carriedAlong = windBend(
        {
          x: field.x + direction.x * travelled,
          y: field.y + direction.y * travelled,
        },
        trail,
        27,
      );
      expect(carriedAlong).toBeCloseTo(earlier, 6);
    }
  });

  test("turning the wind around mirrors the field through the origin", () => {
    const wind: Vector2 = { x: 0.42, y: -0.19 };
    const trail = trailFor(wind);
    const reversed = trailFor({ x: -wind.x, y: -wind.y });

    for (const field of fieldSweep()) {
      // What the crop shows where this wind blows from, it shows at the
      // point opposite the origin when the wind is reversed: the gusts
      // actually come at the field from the side the slider points them at.
      const mirrored = { x: -field.x, y: -field.y };
      expect(windBend(mirrored, reversed, 17)).toBeCloseTo(
        windBend(field, trail, 17),
        10,
      );
    }
  });

  test("the crop keeps the ground the wind before it covered", () => {
    // Two fields that rode the same wind from the clock's first second: this
    // one keeps it, that one has it turned around on it at 20 - the same book
    // keeping the clouds are kept on, where the wind a field was riding gets
    // its remaining time banked against it.
    const firstWind = { cloudWindX: 0.1, cloudWindY: 0.05 };
    const stayed = createCropGustTracker();
    const turned = createCropGustTracker();

    // Nothing is banked while the wind holds, in either case.
    expect(stayed.trail(firstWind, 5).bankedDrift).toEqual({ x: 0, y: 0 });
    expect(turned.trail(firstWind, 5).bankedDrift).toEqual({ x: 0, y: 0 });

    const kept = stayed.trail(firstWind, 20);
    const turnedAround = turned.trail(
      { cloudWindX: -firstWind.cloudWindX, cloudWindY: -firstWind.cloudWindY },
      20,
    );

    // And when it turns, the twenty seconds it had are re-projected onto the
    // new bearing so the pattern carries on from where the old wind left it
    // rather than starting afresh at the new angle. The re-projection keeps
    // the distance positive along whatever direction the wind now blows.
    const distanceTheOldWindCovered = 20 * GUST_SPEED * windForce(kept.wind);
    expect(turnedAround.windSetTime).toBe(20);
    expect(turnedAround.wind).toEqual({
      x: -kept.wind.x,
      y: -kept.wind.y,
    });
    // Re-projected onto the new wind, the distance is positive along the new
    // bearing (the old code gave a negative value because it projected the
    // old wind's banked drift onto the reversed new wind, causing a jump).
    expect(gustsTravelled(turnedAround, 20)).toBeCloseTo(
      distanceTheOldWindCovered,
      6,
    );

    // And that is a real distance, not a rounding error: worth more than a gust
    // width, so a crest that had crossed a field stays crossed rather than
    // snapping back to where a fresh wind would start one. Meanwhile the field
    // that kept its wind keeps marching at that wind's pace.
    expect(Math.abs(gustsTravelled(turnedAround, 20))).toBeGreaterThan(
      GUST_WIDTH,
    );
    expect(gustsTravelled(kept, 20)).toBeCloseTo(distanceTheOldWindCovered, 6);
  });

  test("a clock that goes back re-bases the trail instead of running it backwards", () => {
    const wind = { cloudWindX: 0.3, cloudWindY: -0.2 };
    const tracker = createCropGustTracker();
    const before = tracker.trail(wind, 50); // wind set at 50, 50s of the pane's own wind banked
    const restored = tracker.trail(wind, 10); // ...then a save from 10 is loaded

    // The distance the undone run covered is dropped rather than kept, since it
    // belongs to a timeline that is gone - and the wind is re-based on the
    // restored clock rather than left set 40 seconds in the future, which would
    // have run the pattern backwards.
    expect(before.windSetTime).toBe(50);
    expect(restored.windSetTime).toBe(10);
    expect(restored.bankedDrift).toEqual({ x: 0, y: 0 });

    // So the field picks the march back up at the restored clock: twenty
    // seconds of the wind it rides from there, not minus twenty of a wind that
    // was set 40 seconds further on in a run that has been undone.
    expect(gustsTravelled(restored, 30)).toBeCloseTo(
      20 * GUST_SPEED * windForce(restored.wind),
      6,
    );
    expect(gustsTravelled(restored, 10)).toBe(0);
  });

  test("the gusts march the way the clouds travel, not the way the pane points", () => {
    const tracker = createCropGustTracker();

    // The pane sets Wind X 0.1 and Wind Y 0.05, and the clouds take that as a
    // drift along uv x and uv y: their texture is sampled *ahead* of itself
    // (`uv + uDriftSpeed * uTime` in src/shaders/compute/drifting-cloud.frag),
    // so the sky travels against the vector the pane spells, and a plane keeps
    // v measured the other way to world z (which is why the terrain shaders
    // flip `1.0 - uv.y`). Measured the same way round, the crop's gusts march
    // along (-0.1, 0.05) - the bearing the clouds are on - and not along
    // (0.1, 0.05), which is the angle that had the field waving at an angle to
    // the sky.
    const trail = tracker.trail({ cloudWindX: 0.1, cloudWindY: 0.05 }, 42);

    expect(trail.wind).toEqual({ x: -0.1, y: 0.05 });
    expect(trail.wind).not.toEqual({ x: 0.1, y: 0.05 });
    expect(trail.bankedDrift).toEqual({ x: 0, y: 0 });
    expect(trail.windSetTime).toBe(0);
  });

  test("both views of the crop read the tracked wind from the weather UI", () => {
    const shaderPaths = [
      "src/shaders/water-visualization.frag",
      "src/shaders/reflection-visualization.frag",
    ];

    for (const shaderPath of shaderPaths) {
      const shaderSource = readFileSync(shaderPath, "utf8");

      // The wind is bound, not guessed: no standing direction and no storm
      // speed left in the shader, and the crop drawn from the vector the
      // weather pane sets, kept with the distance that wind and its predecessors
      // have already travelled.
      expect(shaderSource).toContain("uniform vec2 uWind;");
      expect(shaderSource).toContain("length(uWind)");
      expect(shaderSource).not.toContain("WIND_DIR");
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
      expect(shaderSource).not.toContain("uTime * GUST_SPEED");
      expect(shaderSource).toContain(
        "bend * STALK_WIDTH - 0.25 * gustsTravelled();",
      );

      // And the wave is taken by its signed height above upright: a spring
      // back through vertical darkens the crop into the shade between the
      // stalks, and a gust that lays it over lifts it to the silver, with the
      // painted swatch as the mid-tone between the two.
      expect(shaderSource).toContain(
        "mix(standingGrain, stalkShade, -bend)",
      );
      expect(shaderSource).toContain(
        "mix(standingGrain, windSilver, bend);",
      );

      // And the mirror above still mirrors the GLSL's own numbers.
      expect(glslConstant(shaderSource, "GUST_WIDTH")).toBe(GUST_WIDTH);
      expect(glslConstant(shaderSource, "GUST_SPEED")).toBe(GUST_SPEED);
      expect(glslConstant(shaderSource, "MAX_UI_WIND")).toBe(MAX_UI_WIND);
      expect(glslConstant(shaderSource, "CALM_WIND")).toBe(CALM_WIND);
      expect(glslConstant(shaderSource, "STALK_WIDTH")).toBe(STALK_WIDTH);
      expect(glslConstant(shaderSource, "TWO_PI")).toBe(TWO_PI);
    }
  });

  test("every material and the simulation system bind that wind", () => {
    // A shader that reads a wind the material never declares, or a material
    // nothing ever writes, would still compile - it would just show a field
    // stuck at its painted colour - so check the whole chain by text.
    for (const sourcePath of [
      "src/scene/resources/materials/waterVisualization.ts",
      "src/scene/resources/materials/reflectionVisualization.ts",
    ]) {
      const materialSource = readFileSync(sourcePath, "utf8");

      expect(materialSource).toMatch(/uWind: THREE\.IUniform<THREE\.Vector2>/);
      expect(materialSource).toMatch(/uWind: \{ value: new THREE\.Vector2\(/);
      expect(materialSource).toMatch(
        /uGustDrift: THREE\.IUniform<THREE\.Vector2>/,
      );
      expect(materialSource).toMatch(/uGustSetTime: THREE\.IUniform<number>/);
      expect(materialSource).toMatch(
        /uGustDrift: \{ value: new THREE\.Vector2\(/,
      );
      expect(materialSource).toMatch(/uGustSetTime: \{ value: 0 \}/);
    }

    const simulationSource = readFileSync(
      "src/renderer/systems/simulation.ts",
      "utf8",
    );

    // Written every pass on both views of the field - the water flow view and
    // the reflections view - from one tracked trail, so the crop follows the
    // sliders and their history instead of waving at a direction nobody set.
    expect(
      simulationSource.match(
        /uWind\.value\.set\(cropGusts\.wind\.x, cropGusts\.wind\.y\)/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(
      simulationSource.match(/uGustDrift\.value\.set\(/g) ?? [],
    ).toHaveLength(2);
    expect(
      simulationSource.match(/uGustSetTime\.value = cropGusts\.windSetTime/g) ??
        [],
    ).toHaveLength(2);

    // And the wind the trail rides is drawn once per pass, so the two views of
    // a field cannot drift apart from each other's history.
    expect(
      simulationSource.match(/const wind = trackWind\(world, gameTime\)/g) ??
        [],
    ).toHaveLength(1);
  });
});
