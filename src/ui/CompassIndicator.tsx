import * as THREE from "three";

import {
  bearingFromView,
  COMPASS_POINTS,
  compassPointForBearing,
} from "@/renderer/camera/compass";
import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";

/** Edge-to-edge size of the dial in SVG user units (also the rendered size). */
const DIAL_SIZE = 120;

/** Centre of the dial, which is also the pivot every rotation turns about. */
const DIAL_CENTER = DIAL_SIZE / 2;

/** Radius of the dial face. */
const DIAL_RADIUS = 56;

/** Tick ring, as y measured from the top of the face (12 o'clock side). */
const CARDINAL_TICK_OUTER_Y = 17;
const CARDINAL_TICK_INNER_Y = 26;
const MINOR_TICK_OUTER_Y = 19;
const MINOR_TICK_INNER_Y = 25;

/** Where the rose labels sit, closer in than the tick ring so they stay legible. */
const POINT_LABEL_Y = 36;

/**
 * Fixed marker at 12 o'clock, with its tip pointing in at the card. It never
 * rotates: it only says which mark on the turning card is the one we face.
 */
const MARKER_TOP_Y = 3;
const MARKER_TIP_Y = 13;
const MARKER_HALF_WIDTH = 5;

/**
 * The two in-between ticks that sit between each pair of rose points, so the
 * card has a mark every 15° and the eight labelled points stay uncluttered.
 */
const MINOR_TICK_DEGREES = COMPASS_POINTS.flatMap((point) => [
  point.degreesFromNorth + 15,
  point.degreesFromNorth + 30,
]);

/**
 * Compass rose showing which way the camera is pointed.
 *
 * The card rotates rather than the needle: everything on the dial is drawn at
 * 12 o'clock and spun into place, so the rose point that ends up under the
 * fixed marker at the top is the point the camera faces. With the default view
 * from the (+X, +Z) corner the camera looks north-west, so NW sits at the top
 * and N, being 45° the other way round the card, has swung to the right of the
 * marker.
 *
 * Reads the scene camera out of the object cache, so it needs nothing passed
 * in, and keeps `pointerEvents: "none"` so the dial never swallows a click
 * meant for the terrain behind it.
 */
export const CompassIndicator = () => {
  const camera = getObject(GeneralObjectEnum.Camera);

  // `getWorldDirection` hands back where the object looks, and for a camera
  // that is down its local -Z, so this is the view direction itself. The cache
  // types the entry as a plain Object3D, but the runtime object is the scene's
  // OrthographicCamera, whose override applies the -Z correction.
  const viewDirection = camera.getWorldDirection(new THREE.Vector3());

  // Only the horizontal components say where we are pointed, hence the
  // X/Z-only record: the y component would be how steeply we look.
  const bearing = bearingFromView({
    x: viewDirection.x,
    z: viewDirection.z,
  });
  const heading = compassPointForBearing(bearing);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {heading.name} {bearing.toFixed(0)}°
      </div>
      <svg
        width={DIAL_SIZE}
        height={DIAL_SIZE}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
        style={styles.dial}
        role="img"
        aria-label={`Camera facing ${heading.name}, bearing ${bearing.toFixed(0)} degrees`}
      >
        <circle
          cx={DIAL_CENTER}
          cy={DIAL_CENTER}
          r={DIAL_RADIUS}
          fill="rgba(12, 16, 22, 0.7)"
          stroke="#4a5158"
          strokeWidth={1}
        />
        {/* The turning card: spun by minus the bearing, so whatever we face
            comes round to the top, under the fixed marker. */}
        <g transform={`rotate(${-bearing} ${DIAL_CENTER} ${DIAL_CENTER})`}>
          {MINOR_TICK_DEGREES.map((degrees) => (
            <g
              key={`minor-${degrees}`}
              transform={`rotate(${degrees} ${DIAL_CENTER} ${DIAL_CENTER})`}
            >
              <line
                x1={DIAL_CENTER}
                y1={MINOR_TICK_OUTER_Y}
                x2={DIAL_CENTER}
                y2={MINOR_TICK_INNER_Y}
                stroke="#6b737b"
                strokeWidth={1}
              />
            </g>
          ))}
          {COMPASS_POINTS.map((point) => {
            const isCardinal = point.degreesFromNorth % 90 === 0;

            return (
              <g
                key={point.label}
                transform={`rotate(${point.degreesFromNorth} ${DIAL_CENTER} ${DIAL_CENTER})`}
              >
                <line
                  x1={DIAL_CENTER}
                  y1={CARDINAL_TICK_OUTER_Y}
                  x2={DIAL_CENTER}
                  y2={CARDINAL_TICK_INNER_Y}
                  stroke={isCardinal ? "#d7dde3" : "#8a929a"}
                  strokeWidth={isCardinal ? 2 : 1}
                />
                <text
                  x={DIAL_CENTER}
                  y={POINT_LABEL_Y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="ui-monospace, Consolas, monospace"
                  fontSize={11}
                  fontWeight="bold"
                  // North in red, as on any compass card, so the turning dial
                  // still tells you which end of it to look for.
                  fill={point.label === "N" ? "#ff6b6b" : "#e8eef4"}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </g>
        {/* Fixed lubber line: the point sitting under its tip is the way we look. */}
        <path
          d={`M ${DIAL_CENTER - MARKER_HALF_WIDTH} ${MARKER_TOP_Y}
              L ${DIAL_CENTER + MARKER_HALF_WIDTH} ${MARKER_TOP_Y}
              L ${DIAL_CENTER} ${MARKER_TIP_Y} Z`}
          fill="#ffd166"
        />
      </svg>
    </div>
  );
};

CompassIndicator.displayName = "CompassIndicator";

const styles = {
  container: {
    // Bottom-centre: top-right is the painting pane's, top-left the main row's,
    // mid-right the inspector's, bottom-left the save/load buttons'.
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    // Fixed width, exactly the dial plus its padding, so the pane never grows
    // or shrinks with the wording above it - `North` and `North-West` occupy
    // different widths, and a pane that reflows each time the camera swings is
    // a pane that hides the terrain it should only be marking.
    width: "144px",
    boxSizing: "border-box",
    padding: "12px",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: "8px",
    color: "#fff",
    // Display only, so the dial does not block clicks on the terrain behind it.
    pointerEvents: "none" as const,
    textAlign: "center" as const,
  } satisfies React.CSSProperties,
  header: {
    fontFamily: "monospace",
    fontSize: "12px",
    fontWeight: "bold",
    marginBottom: "4px",
    // Shortest form of the reading, so it stays on one line inside the fixed
    // width: the dial itself already shows which way that point lies.
    whiteSpace: "nowrap",
    overflow: "hidden",
  } satisfies React.CSSProperties,
  dial: {
    display: "block",
  } satisfies React.CSSProperties,
};
