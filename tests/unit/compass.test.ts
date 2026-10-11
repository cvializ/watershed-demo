import { expect, test } from "@playwright/test";
import {
  bearingFromView,
  COMPASS_POINTS,
  compassPointForBearing,
  normalizeBearing,
} from "src/renderer/camera/compass";

test.describe("bearing normalising", () => {
  test("maps negative angles onto the other side of the dial", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(-0.5)).toBeCloseTo(359.5, 10);
  });

  test("wraps whole turns and lapped angles back onto the dial", () => {
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(725)).toBeCloseTo(5, 10);
    expect(normalizeBearing(-725)).toBeCloseTo(355, 10);
  });

  test("treats a non-finite angle as north rather than as NaN", () => {
    expect(normalizeBearing(Number.NaN)).toBe(0);
    expect(normalizeBearing(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

test.describe("bearing from a view direction", () => {
  test("looking down -Z is due north", () => {
    expect(bearingFromView({ x: 0, z: -1 })).toBe(0);
  });

  test("looking down +Z is due south, +X due east and -X due west", () => {
    expect(bearingFromView({ x: 0, z: 1 })).toBe(180);
    expect(bearingFromView({ x: 1, z: 0 })).toBe(90);
    expect(bearingFromView({ x: -1, z: 0 })).toBe(270);
  });

  test("the default view from the (+X, +Z) corner faces north-west", () => {
    // Camera parked at (15, 12, 15) looking at the origin: flattened, that is
    // (-1, -1) in (x, z), i.e. between north (-Z) and west (-X).
    expect(bearingFromView({ x: -1, z: -1 })).toBeCloseTo(315, 10);
    expect(
      compassPointForBearing(bearingFromView({ x: -1, z: -1 })).label,
    ).toBe("NW");
  });

  test("ignores how long the direction is, since only its heading matters", () => {
    expect(bearingFromView({ x: -7, z: -7 })).toBeCloseTo(315, 10);
    expect(bearingFromView({ x: -0.001, z: -0.001 })).toBeCloseTo(315, 6);
  });

  test("a direction with no horizontal component reads as north", () => {
    expect(bearingFromView({ x: 0, z: 0 })).toBe(0);
    expect(bearingFromView({ x: Number.NaN, z: 1 })).toBe(0);
  });
});

test.describe("rose point for a bearing", () => {
  test("every rose point answers to its own bearing", () => {
    for (const point of COMPASS_POINTS) {
      expect(compassPointForBearing(point.degreesFromNorth)).toBe(point);
    }
  });

  test("rounds to the nearest point, so ranges sit centred", () => {
    // 350° is ten degrees off north, hence still north rather than north-west.
    expect(compassPointForBearing(350).label).toBe("N");
    expect(compassPointForBearing(359).label).toBe("N");
    expect(compassPointForBearing(-10).label).toBe("N");
    // 20° is closer to N than to NE, while 25° has passed the halfway mark.
    expect(compassPointForBearing(20).label).toBe("N");
    expect(compassPointForBearing(25).label).toBe("NE");
    expect(compassPointForBearing(100).label).toBe("E");
    expect(compassPointForBearing(200).label).toBe("S");
  });

  test("wraps bearings outside [0, 360) before picking a point", () => {
    expect(compassPointForBearing(405).label).toBe("NE");
    expect(compassPointForBearing(-45).label).toBe("NW");
  });

  test("keeps all eight points, clockwise from north", () => {
    expect(COMPASS_POINTS.map((point) => point.label)).toEqual([
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW",
    ]);
    expect(COMPASS_POINTS[0].name).toBe("North");
  });
});
