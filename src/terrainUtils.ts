import {
  fbmNoise2d,
  ridgedMultifractal2d,
  stretchToUnitRange,
  type FractalNoiseField,
} from "@/utils/valueNoise";

/**
 * Procedural rugged terrain heightfield.
 *
 * The shape is layered the way real landscapes are:
 *
 * 1. a wide continental swell (fractal Brownian motion) that lifts some regions
 *    and dips others, so the plane has highlands and basins;
 * 2. mid-scale hills, which keep every part of the map rough instead of leaving
 *    dead-flat plains;
 * 3. ridged multifractal mountains - unlike fBm alone these have sharp crests and
 *    steep valley walls, i.e. the part that reads as "rugged";
 * 4. a mountain mask so ridges cluster into ranges with incised valleys between
 *    them rather than smearing into uniform noise;
 * 5. fine surface grit, so slopes are never glass-smooth under the water sim.
 *
 * Coordinates are world units on the terrain plane (the mesh spans -size/2 to
 * +size/2 in both axes). Every frequency below is cycles per world unit, so features
 * keep their physical size regardless of mesh tessellation. The widest ridge detail
 * sits around three mesh cells wide: anything finer aliases against the terrain grid
 * and reads as static rather than as rock.
 *
 * Calibrated over a 12x12 plane: heights from about -1.5 to +1.4 with the median back
 * at the valley datum, an interquartile spread of ~0.65 (the previous field managed
 * ~0.3 in total) and peak gradient around 2 at mesh spacing - roughly 12% of cells
 * steeper than 45 degrees, where the old terrain had none.
 */

/** Valley datum: keeps the average bed near the height the scene was framed for. */
const TERRAIN_BASE_HEIGHT = -0.5;

/** Low-frequency coordinate offset that bends ridgelines instead of leaving them straight. */
const DOMAIN_WARP_UNITS = 2.4;
const DOMAIN_WARP_FIELD: FractalNoiseField = {
  octaves: 2,
  baseFrequency: 0.14,
  seed: 3,
};

/** Wide continental swell. Two wavelengths across the plane keeps the datum honest. */
const CONTINENTAL_AMPLITUDE = 0.55;
const CONTINENTAL_FIELD: FractalNoiseField = {
  octaves: 4,
  baseFrequency: 0.16,
  seed: 59,
};

/** Mask field: same shape family as the swell, but a different sample of it. */
const MASK_FIELD: FractalNoiseField = {
  octaves: 4,
  baseFrequency: 0.16,
  seed: 23,
};

/** Amplitude of mid-scale hills that rough up the whole plane. */
const HILLS_AMPLITUDE = 0.4;
const HILLS_FIELD: FractalNoiseField = {
  octaves: 4,
  baseFrequency: 0.3,
  persistence: 0.55,
  seed: 71,
};

/** Ridged mountain field: crests stay sharp because every octave inverts |noise|. */
const RIDGE_FIELD: FractalNoiseField = {
  octaves: 5,
  baseFrequency: 0.21,
  persistence: 0.5,
  seed: 101,
};

/** Measured edges of the ridged field's compressed distribution (see stretchToUnitRange). */
const RIDGE_LOW_EDGE = 0.34;
const RIDGE_HIGH_EDGE = 0.9;

/** Above 1 sharpens crests further; below 1 rounds them into domes. */
const RIDGE_CREST_SHARPNESS = 1.3;

/** Mountain relief: always this much ridge height, plus up to this much more when masked in. */
const MOUNTAIN_FLOOR_RELIEF = 0.35;
const MOUNTAIN_MASKED_RELIEF = 1.2;

/** Measured edges of the mask's compressed distribution. */
const MASK_LOW_EDGE = 0.3;
const MASK_HIGH_EDGE = 0.7;
const MASK_CONTRAST = 1.2;

/** Fine surface roughness. */
const SURFACE_GRIT_AMPLITUDE = 0.06;
const SURFACE_GRIT_FIELD: FractalNoiseField = {
  octaves: 2,
  baseFrequency: 1.2,
  seed: 57,
};

/** Typical absolute magnitude an fBm sum actually reaches, before contrast stretching. */
const FBM_TYPICAL_EDGE = 0.45;

/**
 * Contrast-stretch a signed noise sample that hovers near its mean, then scale it to
 * the requested amplitude - so declared amplitudes mean usable relief instead of
 * nominal maxima that octave averaging almost never reaches.
 */
const applyNoiseGain = (noiseValue: number, amplitude: number): number =>
  (stretchToUnitRange(noiseValue, -FBM_TYPICAL_EDGE, FBM_TYPICAL_EDGE) * 2 -
    1) *
  amplitude;

/** Offset the sample position so ridgelines meander like eroded real ones. */
const warpDomain = (
  x: number,
  y: number,
): { warpedX: number; warpedY: number } => ({
  warpedX: x + fbmNoise2d(x, y + 31.7, DOMAIN_WARP_FIELD) * DOMAIN_WARP_UNITS,
  warpedY: y + fbmNoise2d(x + 11.3, y, DOMAIN_WARP_FIELD) * DOMAIN_WARP_UNITS,
});

/** Wide rolling swell in [-CONTINENTAL_AMPLITUDE, CONTINENTAL_AMPLITUDE]. */
const continentalHeightAt = (x: number, y: number): number =>
  applyNoiseGain(fbmNoise2d(x, y, CONTINENTAL_FIELD), CONTINENTAL_AMPLITUDE);

/** Mid-scale hills in [-HILLS_AMPLITUDE, HILLS_AMPLITUDE]. */
const hillsHeightAt = (x: number, y: number): number =>
  applyNoiseGain(fbmNoise2d(x, y, HILLS_FIELD), HILLS_AMPLITUDE);

/**
 * Mountain contribution in [0, MOUNTAIN_FLOOR_RELIEF + MOUNTAIN_MASKED_RELIEF]:
 * sharpened ridged crests scaled by a contrast mask, so ranges rise out of rougher
 * ground rather than floating above a flat board.
 */
const mountainHeightAt = (x: number, y: number): number => {
  const warped = warpDomain(x, y);

  const ridgeCrests = Math.pow(
    stretchToUnitRange(
      ridgedMultifractal2d(warped.warpedX, warped.warpedY, RIDGE_FIELD),
      RIDGE_LOW_EDGE,
      RIDGE_HIGH_EDGE,
    ),
    RIDGE_CREST_SHARPNESS,
  );

  const maskNoise = stretchToUnitRange(
    fbmNoise2d(warped.warpedX, warped.warpedY, MASK_FIELD) * 0.5 + 0.5,
    MASK_LOW_EDGE,
    MASK_HIGH_EDGE,
  );

  return (
    ridgeCrests *
    (MOUNTAIN_FLOOR_RELIEF +
      Math.pow(maskNoise, MASK_CONTRAST) * MOUNTAIN_MASKED_RELIEF)
  );
};

/** Small-scale roughness in [-SURFACE_GRIT_AMPLITUDE, SURFACE_GRIT_AMPLITUDE]. */
const surfaceGritHeightAt = (x: number, y: number): number =>
  fbmNoise2d(x, y, SURFACE_GRIT_FIELD) * SURFACE_GRIT_AMPLITUDE;

/**
 * Calculate height for terrain at a given position.
 * Creates rugged terrain: mountain ranges with sharp crests, incised valleys, rough
 * slopes and a wide continental swell underneath.
 */
export const calculateHeight = (x: number, y: number): number =>
  TERRAIN_BASE_HEIGHT +
  continentalHeightAt(x, y) +
  hillsHeightAt(x, y) +
  mountainHeightAt(x, y) +
  surfaceGritHeightAt(x, y);
