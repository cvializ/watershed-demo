import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Invariants of the gusts over the cultivated field, checked against a CPU mirror of
 * the shader code (see windBend in src/shaders/water-visualization.frag and
 * src/shaders/reflection-visualization.frag), plus source guards that the wind
 * really is taken from the weather UI rather than guessed.
 *
 * Why a mirror in plain node and not only on the GPU (same reasoning as
 * tests/unit/sedimentConservation.test.ts): every statement below is about which
 * terms talk to which - calm wind stills the crop, a harder wind swings it further,
 * a gust stays pinned to the ground while the wind carries it, and the whole field
 * mirrors when the wind is reversed - and those are testable at double precision and
 * microsecond cost. The last two blocks keep the mirror honest: they read the GLSL
 * text, so a shader that quietly goes back to a standing wind, or to a direction the
 * weather pane cannot set, fails instead of ignoring the sliders.
 */

/** A wind or a field point, as the shaders hold it in a `vec2`. */
type Vector2 = { x: number; y: number };

/** The constants the shaders declare, pinned against the GLSL below. */
const GUST_WIDTH = 3.0;
const GUST_SPEED = 2.5;
const MAX_UI_WIND = 0.707;
const CALM_WIND = 0.01;
const STALK_WIDTH = 0.75;
const TWO_PI = 6.2831853;

/** The three tones of the crop, as the shaders pick them. */
const STALK_SHADE: [number, number, number] = [0.45, 0.37, 0.2];
const STANDING_GRAIN: [number, number, number] = [0.86, 0.8, 0.4];
const WIND_SILVER: [number, number, number] = [0.95, 0.9, 0.66];

/** The wind the weather pane starts on. */
const DEFAULT_WIND: Vector2 = { x: 0.1, y: 0.05 };

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

/** Mirrors `windBend`. */
const windBend = (field: Vector2, wind: Vector2, time: number): number => {
  const direction = windDirection(wind);
  const strength = windForce(wind);
  if (strength <= 0) {
    return 0;
  }
  const across = { x: -direction.y, y: direction.x };
  const gustUv = {
    x:
      (field.x * direction.x +
        field.y * direction.y -
        time * GUST_SPEED * strength) /
      GUST_WIDTH,
    y: (field.x * across.x + field.y * across.y) / GUST_WIDTH,
  };

  const train = Math.sin(gustUv.x * TWO_PI);
  const patchiness = valueNoise({ x: gustUv.x, y: gustUv.y + 4.31 });
  const stagger = Math.sin((gustUv.y * 0.8 + gustUv.x * 0.5) * TWO_PI);

  return strength * (0.7 * train * (0.35 + 0.65 * patchiness) + 0.3 * stagger);
};

/** Mirrors `cropColor`. */
const cropColor = (
  field: Vector2,
  wind: Vector2,
  time: number,
): [number, number, number] => {
  const bend = windBend(field, wind, time);
  // The swatch is the mid-tone, so a gust swings the crop either side of it:
  // toward the shade between the stalks as the crop springs back through
  // upright, toward the silver of a laid field as a gust flattens it.
  const otherTone = bend < 0 ? STALK_SHADE : WIND_SILVER;
  const swing = Math.abs(bend);
  const cropTone = (channel: number): number =>
    STANDING_GRAIN[channel] +
    (otherTone[channel] - STANDING_GRAIN[channel]) * swing;

  // Heads a fraction of a unit apart, each catching the light a little
  // differently: displaced along the wind as the stalks bend, and dragged
  // through the pattern at a fraction of the wind between gusts.
  const direction = windDirection(wind);
  const alongWind = bend * STALK_WIDTH - time * 0.25 * windForce(wind);
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
const widestSwing = (wind: Vector2, time: number): number =>
  Math.max(
    ...fieldSweep().map((field) => Math.abs(windBend(field, wind, time))),
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
    const becalmed: Vector2 = { x: 0, y: 0 };
    for (const field of fieldSweep()) {
      expect(windBend(field, becalmed, 42)).toBe(0);

      // With nothing to bend it, every channel sits on the swatch, so the
      // field stays recognisably the crop that was painted: no point drifts
      // toward the shade between the stalks or the silver of a laid field.
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
  });

  test("the crop swings further the harder the wind is set", () => {
    const lightBreeze = widestSwing(DEFAULT_WIND, 42);
    const gale = widestSwing({ x: 0.5, y: 0.5 }, 42);

    expect(lightBreeze).toBeGreaterThan(0);
    expect(lightBreeze).toBeLessThan(1);
    expect(gale).toBeGreaterThan(lightBreeze * 1.5);
  });

  test("a gust stays pinned to the field while the wind carries it along", () => {
    const wind: Vector2 = { x: -0.3, y: 0.4 };
    const direction = windDirection(wind);
    // Twenty-two seconds on, a gust has travelled this far and so shows the
    // same bend it showed at the point upwind of it: the pattern travels
    // across the ground rather than sitting still while time passes, and it
    // does so at a pace the wind sets.
    const travelled = 22 * GUST_SPEED * windForce(wind);

    for (const field of fieldSweep()) {
      const earlier = windBend(field, wind, 5);
      const carriedAlong = windBend(
        {
          x: field.x + direction.x * travelled,
          y: field.y + direction.y * travelled,
        },
        wind,
        27,
      );
      expect(carriedAlong).toBeCloseTo(earlier, 6);
    }
  });

  test("turning the wind around mirrors the field through the origin", () => {
    const wind: Vector2 = { x: 0.42, y: -0.19 };
    for (const field of fieldSweep()) {
      // What the crop shows where this wind blows from, it shows at the
      // point opposite the origin when the wind is reversed: the gusts
      // actually come at the field from the side the slider points them at.
      const mirrored = { x: -field.x, y: -field.y };
      const windReversed = { x: -wind.x, y: -wind.y };
      expect(windBend(mirrored, windReversed, 17)).toBeCloseTo(
        windBend(field, wind, 17),
        10,
      );
    }
  });

  test("both views of the crop read the wind from the weather UI", () => {
    const shaderPaths = [
      "src/shaders/water-visualization.frag",
      "src/shaders/reflection-visualization.frag",
    ];

    for (const shaderPath of shaderPaths) {
      const shaderSource = readFileSync(shaderPath, "utf8");

      // The wind is bound, not guessed: no standing direction and no
      // storm speed left in the shader, and the crop drawn from the vector
      // the weather pane sets.
      expect(shaderSource).toContain("uniform vec2 uWind;");
      expect(shaderSource).toContain("length(uWind)");
      expect(shaderSource).not.toContain("WIND_DIR");

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
    }

    const simulationSource = readFileSync(
      "src/renderer/systems/simulation.ts",
      "utf8",
    );

    // Written every pass on both views of the field - the water flow view and
    // the reflections view - so the crop follows the sliders instead of
    // waving at a direction nobody set.
    expect(
      simulationSource.match(
        /uWind\.value\.set\(world\.cloudWindX, world\.cloudWindY\)/g,
      ) ?? [],
    ).toHaveLength(2);
  });
});
