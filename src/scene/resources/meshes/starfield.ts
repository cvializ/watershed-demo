import * as THREE from "three";

import { MeshEnum } from "@/scene/resources/mesh";
import { getObject } from "@/scene/resources/objectCache";

/**
 * A starfield group containing point stars and streak lines.
 *
 * Stars are rendered as `Points` with fixed-pixel sizing. Streaks are
 * rendered as `LineSegments` — one line per star, trailing behind in the
 * direction opposite to the starfield's rotation.
 */
export type StarfieldResource = THREE.Group;

/**
 * Radius of the star sphere, centered at the world origin.
 *
 * Stars are distributed over the sphere surface. The sphere is large enough
 * that, from the camera's viewpoint, enough stars fall within the
 * orthographic frustum to form a convincing night sky. The sphere rotates
 * with the sun, so the visible patch sweeps across the star field over time.
 */
const STARFIELD_RADIUS = 75;

/** Number of stars to scatter across the sphere surface. */
const STAR_COUNT = 20000;

/** Streak length as a fraction of sphere radius (streak goes inward from star). */
const STREAK_FRACTION = 0.015;

/** Star tints, from white to blue-white and warm orange. */
const STAR_TINTS = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xcdd7ff),
  new THREE.Color(0xfff2d6),
  new THREE.Color(0xffd0a1),
  new THREE.Color(0xaecbff),
];

/**
 * Build a starfield with streaks on a sphere centered at the world origin.
 *
 * Stars are uniformly scattered over the sphere surface using the standard
 * spherical-coordinate method (with `acos` for the polar angle to ensure
 * uniform distribution). Each star has a streak line trailing behind it in
 * the direction opposite to the starfield's rotation, creating a subtle
 * motion-blur aesthetic.
 */
export const createStarfieldResource = (): StarfieldResource => {
  // Orbit axis: the normal to the sun's orbit plane (must match starfieldSystem).
  // Sun orbits: x = r·cos(θ), y = r·sin(θ)·sin(i), z = r·sin(θ)·cos(i)
  // Plane normal = (1,0,0) × (0, sin(i), cos(i)) = (0, -cos(i), sin(i))
  const inclination = Math.PI / 4;
  const orbitAxis = new THREE.Vector3(0, -Math.cos(inclination), Math.sin(inclination)).normalize();

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const streakEndPositions = new Float32Array(STAR_COUNT * 3);
  const streakEndColors = new Float32Array(STAR_COUNT * 3);

  const streakLength = STARFIELD_RADIUS * STREAK_FRACTION;

  for (let index = 0; index < STAR_COUNT; index++) {
    const offset = index * 3;

    // Uniform distribution over a sphere surface
    const theta = Math.random() * 2 * Math.PI; // azimuth
    const phi = Math.acos(2 * Math.random() - 1); // polar
    const sx = STARFIELD_RADIUS * Math.sin(phi) * Math.cos(theta);
    const sy = STARFIELD_RADIUS * Math.sin(phi) * Math.sin(theta);
    const sz = STARFIELD_RADIUS * Math.cos(phi);
    positions[offset] = sx;
    positions[offset + 1] = sy;
    positions[offset + 2] = sz;

    const tint = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    const brightness = 0.6 + Math.random() * 0.4;
    colors[offset] = tint.r * brightness;
    colors[offset + 1] = tint.g * brightness;
    colors[offset + 2] = tint.b * brightness;

    // Streak direction: tangential to rotation, trailing behind motion.
    // For rotation around orbitAxis, tangential velocity = cross(orbitAxis, position).
    // Streak goes opposite to motion (inward along the streak direction).
    const tx = orbitAxis.y * sz - orbitAxis.z * sy;
    const ty = orbitAxis.z * sx - orbitAxis.x * sz;
    const tz = orbitAxis.x * sy - orbitAxis.y * sx;
    const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);

    if (tLen > 0.001) {
      // Streak endpoint: star position minus normalized tangential * streak length
      streakEndPositions[offset] = sx - (tx / tLen) * streakLength;
      streakEndPositions[offset + 1] = sy - (ty / tLen) * streakLength;
      streakEndPositions[offset + 2] = sz - (tz / tLen) * streakLength;
      // Fade the streak tail (0.15x brightness at tail)
      const fadeFactor = 0.15;
      streakEndColors[offset] = colors[offset] * fadeFactor;
      streakEndColors[offset + 1] = colors[offset + 1] * fadeFactor;
      streakEndColors[offset + 2] = colors[offset + 2] * fadeFactor;
    } else {
      streakEndPositions[offset] = sx;
      streakEndPositions[offset + 1] = sy;
      streakEndPositions[offset + 2] = sz;
      streakEndColors[offset] = 0;
      streakEndColors[offset + 1] = 0;
      streakEndColors[offset + 2] = 0;
    }
  }

  // Star points geometry
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const starMaterial = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const starPoints = new THREE.Points(starGeometry, starMaterial);

  // Streak lines geometry: pairs of (starPos, streakEndPos)
  const streakPositions = new Float32Array(STAR_COUNT * 6); // 2 vertices × 3 coords
  const streakColors = new Float32Array(STAR_COUNT * 6);

  for (let index = 0; index < STAR_COUNT; index++) {
    const offset = index * 6;
    // Start vertex: star position
    streakPositions[offset] = positions[index * 3];
    streakPositions[offset + 1] = positions[index * 3 + 1];
    streakPositions[offset + 2] = positions[index * 3 + 2];
    // End vertex: streak endpoint
    streakPositions[offset + 3] = streakEndPositions[index * 3];
    streakPositions[offset + 4] = streakEndPositions[index * 3 + 1];
    streakPositions[offset + 5] = streakEndPositions[index * 3 + 2];
    // Colors: bright at star, faded at tail
    streakColors[offset] = colors[index * 3];
    streakColors[offset + 1] = colors[index * 3 + 1];
    streakColors[offset + 2] = colors[index * 3 + 2];
    streakColors[offset + 3] = streakEndColors[index * 3];
    streakColors[offset + 4] = streakEndColors[index * 3 + 1];
    streakColors[offset + 5] = streakEndColors[index * 3 + 2];
  }

  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
  streakGeometry.setAttribute("color", new THREE.BufferAttribute(streakColors, 3));

  const streakMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const streakLines = new THREE.LineSegments(streakGeometry, streakMaterial);

  // Group containing both stars and streaks
  const starfield = new THREE.Group();
  starfield.add(starPoints);
  starfield.add(streakLines);

  // The star sphere is centered at the origin and never cull against the
  // frustum — the system rotates it to match the sun, so stars always appear
  // in the sky regardless of where the camera is looking.
  starfield.frustumCulled = false;

  // Draw before scene geometry so terrain/water always overdraw the sky.
  starfield.renderOrder = -1;

  return starfield;
};

/**
 * Retrieve the registered starfield from the object cache.
 */
export const getStarfieldResource = (): StarfieldResource =>
  getObject(MeshEnum.Starfield) as StarfieldResource;
