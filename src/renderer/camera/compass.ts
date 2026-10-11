/**
 * Pure maths behind the compass rose.
 *
 * Just degrees and plain objects, so the bearing arithmetic can be unit tested
 * with nothing but numbers (the only thing borrowed from the camera maths is
 * the `PlaneVector` type). The React side in `src/ui/CompassIndicator.tsx`
 * feeds it the camera's world view direction and rotates the dial.
 *
 * World convention, matching the terrain grid (see `terrainHeightGrid.ts`):
 * the terrain lies flat on the XZ plane with +X east and -Z north, so looking
 * down -Z is looking due north and looking down +Z is due south.
 */
import type { PlaneVector } from "@/renderer/camera/cameraMotion";

/** A point on the rose, plus where it sits on the dial. */
export type CompassPoint = {
  /** Short label printed on the dial: N, NE, E, ... */
  label: string;
  /** Said out loud next to the bearing: North, North-East, ... */
  name: string;
  /** Where the point sits, in degrees measured clockwise from north. */
  degreesFromNorth: number;
};

/** Full turn; used to wrap bearings into `[0, 360)`. */
const FULL_CIRCLE_DEGREES = 360;

/** Degrees between neighbouring points on an eight-point rose (360 / 8). */
const DEGREES_PER_COMPASS_POINT = FULL_CIRCLE_DEGREES / 8;

/** The eight points of the rose, listed clockwise from north. */
export const COMPASS_POINTS = [
  { label: "N", name: "North", degreesFromNorth: 0 },
  { label: "NE", name: "North-East", degreesFromNorth: 45 },
  { label: "E", name: "East", degreesFromNorth: 90 },
  { label: "SE", name: "South-East", degreesFromNorth: 135 },
  { label: "S", name: "South", degreesFromNorth: 180 },
  { label: "SW", name: "South-West", degreesFromNorth: 225 },
  { label: "W", name: "West", degreesFromNorth: 270 },
  { label: "NW", name: "North-West", degreesFromNorth: 315 },
] as const satisfies readonly CompassPoint[];

/**
 * Wrap any angle into `[0, 360)`, so -90° and 270° read as the same heading
 * and a bearing that has lapped the dial more than once still lands on it.
 * Non-finite input has no heading to report and reads as north.
 */
export const normalizeBearing = (degrees: number): number => {
  if (!Number.isFinite(degrees)) {
    return 0;
  }

  const wrapped = degrees % FULL_CIRCLE_DEGREES;

  return wrapped < 0 ? wrapped + FULL_CIRCLE_DEGREES : wrapped;
};

/**
 * Compass bearing, in degrees clockwise from north, for a direction lying on
 * the world's horizontal plane. Only the horizontal components matter, which
 * is why the view direction is handed over as a `PlaneVector`: the vertical
 * component says how steeply we look, not where.
 *
 * North is -Z, so the north component of the direction is `-z` and the east
 * component is `x`. `atan2(east, north)` is then the angle measured clockwise
 * from north, which is exactly how a bearing is quoted.
 *
 * A direction with no horizontal component — straight up, or straight down
 * through the terrain — has no heading to point at, and reads as north rather
 * than as NaN.
 */
export const bearingFromView = (view: PlaneVector): number => {
  const east = view.x;
  const north = -view.z;

  if (!Number.isFinite(east) || !Number.isFinite(north)) {
    return 0;
  }

  if (Math.hypot(east, north) < Number.EPSILON) {
    return 0;
  }

  return normalizeBearing((Math.atan2(east, north) * 180) / Math.PI);
};

/**
 * The rose point nearest a bearing. Rounding rather than flooring is what
 * makes the ranges centred: 350° is a few degrees off north, not still
 * north-west, so it rounds back to N.
 */
export const compassPointForBearing = (bearing: number): CompassPoint => {
  const normalized = normalizeBearing(bearing);
  const pointIndex =
    Math.round(normalized / DEGREES_PER_COMPASS_POINT) % COMPASS_POINTS.length;

  return COMPASS_POINTS[pointIndex];
};
