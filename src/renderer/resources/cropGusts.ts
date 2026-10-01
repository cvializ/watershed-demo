import * as THREE from "three";

/** A vector in whichever frame the crop is measured in: x along world x, y along world z. */
export type FieldVector = { x: number; y: number };

/**
 * Where the gusts over the cultivated field stand: which way they march, how
 * far that wind and every wind before it have already dragged the pattern, and
 * when the current wind was set.
 *
 * All three are kept in the field's own frame - x along world x, y along world
 * z - because that is the frame the crop is sampled in (see `windBend` in
 * src/shaders/water-visualization.frag and
 * src/shaders/reflection-visualization.frag), while the weather pane's
 * `cloudWindX` / `cloudWindY` are a drift in the cloud texture's uv frame.
 */
export type CropGustTrail = {
  /**
   * Which way the gusts march, and how hard: the wind the pane sets, turned
   * into the field's frame so the crop blows the way the clouds travel. A wind
   * of nothing leaves the stand upright.
   */
  wind: FieldVector;

  /**
   * How far the winds before this one already dragged the pattern, in the same
   * field frame - a distance in world units, not a wind still to be multiplied
   * by time, so it stays true however long the earlier wind blew.
   */
  bankedDrift: FieldVector;

  /**
   * When the current wind was set, on the clock the crop samples with, so the
   * shader can add this wind's own contribution to the distance banked above.
   */
  windSetTime: number;
};

export type CropGustTracker = {
  /**
   * The wind the crop gusts ride, and how far they have travelled on it - read
   * from the weather pane's wind and the game clock, and unchanged until one of
   * them moves.
   */
  trail: (
    world: { cloudWindX: number; cloudWindY: number },
    gameTime: number,
  ) => CropGustTrail;
};

/**
 * How far the crop is marched per second at the strongest wind the pane allows,
 * how strong that wind is, and what counts as too faint to bother the crop
 * with. Kept in step with `GUST_SPEED`, `MAX_UI_WIND` and `CALM_WIND` in
 * src/shaders/water-visualization.frag and src/shaders/reflection-visualization.frag:
 * the distance banked below and the distance the shader still has to travel are
 * the same law applied to the wind before it and the wind now, so a change of
 * wind adds to the march rather than restarting it.
 */
const GUST_SPEED = 2.5;
const MAX_UI_WIND = 0.707;
const CALM_WIND = 0.01;

/** The wind the weather pane starts on, and so the first wind the crop rides. */
const WIND_THE_PANE_STARTS_ON = { x: 0.1, y: 0.05 };

/**
 * Mirrors `cropWindDirection` in the crop shaders: a unit vector along the
 * wind, or no direction at all when the wind is too faint to name - and with
 * no direction there is no march to bank, since `cropWindForce` answers 0 for
 * that wind too.
 */
const cropWindDirection = (wind: THREE.Vector2): THREE.Vector2 => {
  const windLength = wind.length();

  if (windLength <= CALM_WIND) {
    return new THREE.Vector2(0, 0);
  }

  return wind.clone().divideScalar(windLength);
};

/** Mirrors `cropWindForce` in the crop shaders: 0 with the wind off, 1 at the strongest wind the pane allows. */
const cropWindForce = (wind: THREE.Vector2): number =>
  Math.sqrt(Math.min(1, Math.max(0, wind.length() / MAX_UI_WIND)));

/**
 * Track the wind over the crop the way the clouds track theirs (see
 * `setWeather` in src/gpu/waterFlowSimulation/variables/createGpuClouds.ts),
 * so the crop waves along with the sky instead of at an angle to it.
 *
 * Two things come of that, both of which the crop shaders' old
 * `uTime * windSpeed` offset got wrong.
 *
 * First, the direction. The pane's wind is a drift in the cloud texture's uv
 * frame, and two conversions stand between that frame and the field's: a
 * texture sampled at `uv + wind * time` shows what used to lie further along,
 * so the sky travels *against* the vector the pane sets; and a plane's v is
 * measured with the plane's y while a terrain's world z is measured against it
 * (`createTerrainGeometry` rotates its plane by -PI/2, which is why
 * `terrainHeightSampler.ts` converts with `const localY = -worldZ` and the
 * terrain shaders with `1.0 - uv.y`), so a vector that runs along uv y runs
 * the other way to world z. Negating the first component and keeping the second
 * puts the gusts on the bearing the clouds are actually travelling on.
 *
 * Second, the distance. Rather than re-deriving how far the pattern has
 * travelled from the clock every pass, the wind a field was riding gets its
 * remaining time banked against it and the new wind starts accumulating from
 * when it was set, so a gust that was mid-crossing when the slider moved stays
 * mid-crossing instead of snapping back to wherever the new wind would have
 * started the pattern. A restore that rewinds the clock re-bases the trail
 * instead, since the distance banked for it belongs to a run that is over.
 */
export const createCropGustTracker = (): CropGustTracker => {
  // The same three pieces of state the cloud tracker keeps: the wind being
  // tracked, what the earlier winds banked against it, and when the current
  // wind was set. The wind is kept in the field's frame, which is why the
  // pane's starting wind is handed over with its x negated.
  let wind = new THREE.Vector2(
    -WIND_THE_PANE_STARTS_ON.x,
    WIND_THE_PANE_STARTS_ON.y,
  );
  let bankedDrift = new THREE.Vector2(0, 0);
  let windSetTime = 0;

  const tracker: CropGustTracker = {
    trail: (world, gameTime) => {
      // The pane's wind is a drift along uv x and uv y, so turning it into the
      // field's frame is a flip of the first component: the pattern travels
      // against the drift, and the field's z runs against the texture's v.
      const fieldWind = new THREE.Vector2(-world.cloudWindX, world.cloudWindY);

      if (gameTime < windSetTime) {
        // A restore put the clock back before this wind was set, so the
        // distance banked for it belongs to a run that is over: re-base to the
        // restored moment rather than sampling from a wind set in the future,
        // which would run the pattern backwards.
        wind = fieldWind;
        bankedDrift = new THREE.Vector2(0, 0);
        windSetTime = gameTime;
      } else if (fieldWind.x !== wind.x || fieldWind.y !== wind.y) {
        // Bank however far the wind that was blowing took the pattern between
        // when it was set and now, then let the new wind accumulate from here.
        // Nothing else advances this state, so a pass that skips this system,
        // or a load that jumps the clock forward, still leaves the pattern
        // exactly where the wind that crossed the field left it.
        const windElapsed = gameTime - windSetTime;

        bankedDrift = bankedDrift
          .clone()
          .add(
            cropWindDirection(wind).multiplyScalar(
              GUST_SPEED * cropWindForce(wind) * windElapsed,
            ),
          );
        wind = fieldWind;
        windSetTime = gameTime;
      }

      return { wind, bankedDrift, windSetTime };
    },
  };

  return tracker;
};

/**
 * The tracker the simulation system samples every pass, so a field shows the
 * same gust pattern whether it is seen in the water flow view or in the
 * reflections view - both materials are handed the same tracked trail.
 */
export const cropGustTracker = createCropGustTracker();
