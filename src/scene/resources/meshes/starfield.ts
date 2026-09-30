import * as THREE from "three";

import { MeshEnum } from "@/scene/resources/mesh";
import { getObject } from "@/scene/resources/objectCache";

/**
 * A starfield point cloud. Each star is a fixed-pixel point, so this type is
 * narrowed to the single `PointsMaterial` the factory always builds.
 */
export type StarfieldResource = THREE.Points<
  THREE.BufferGeometry,
  THREE.PointsMaterial
>;

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

/** Star tints, from white to blue-white and warm orange. */
const STAR_TINTS = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xcdd7ff),
  new THREE.Color(0xfff2d6),
  new THREE.Color(0xffd0a1),
  new THREE.Color(0xaecbff),
];

/**
 * Build a starfield point cloud on a sphere centered at the world origin.
 *
 * Stars are uniformly scattered over the sphere surface using the standard
 * spherical-coordinate method (with `acos` for the polar angle to ensure
 * uniform distribution). The sphere rotates around the sun's orbit axis so
 * the visible patch sweeps across the stars as the sun moves.
 */
export const createStarfieldResource = (): StarfieldResource => {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);

  for (let index = 0; index < STAR_COUNT; index++) {
    const offset = index * 3;

    // Uniform distribution over a sphere surface
    const theta = Math.random() * 2 * Math.PI; // azimuth
    const phi = Math.acos(2 * Math.random() - 1); // polar
    positions[offset] = STARFIELD_RADIUS * Math.sin(phi) * Math.cos(theta);
    positions[offset + 1] = STARFIELD_RADIUS * Math.sin(phi) * Math.sin(theta);
    positions[offset + 2] = STARFIELD_RADIUS * Math.cos(phi);

    const tint = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    const brightness = 0.6 + Math.random() * 0.4;
    colors[offset] = tint.r * brightness;
    colors[offset + 1] = tint.g * brightness;
    colors[offset + 2] = tint.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const starfield = new THREE.Points(geometry, material);

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