/**
 * Shared world-size constants for the terrain.
 *
 * The terrain world spans this size on each axis, centered on the origin
 * (-20..+20 with a 40-unit world). The Wissahickon DEM itself covers only
 * the central 12 units, so heights clamp to the DEM edge beyond that and
 * terrain keeps filling the screen from any camera angle.
 *
 * Every system that converts between world coordinates and terrain/texture
 * coordinates (water simulation, water sources, animals, terrain painting,
 * mesh and texture builders) must import these instead of re-declaring its
 * own copy, so all coordinate spaces stay aligned.
 */

/** Terrain side length in world units. */
export const TERRAIN_SIZE = 40;

/** Half the terrain side length: the terrain spans -20..+20 on each axis. */
export const TERRAIN_HALF_SIZE = TERRAIN_SIZE / 2;