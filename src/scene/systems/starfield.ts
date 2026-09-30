import type { SceneSystem } from "@/scene/types";

import { getStarfieldResource } from "@/scene/resources/meshes/starfield";
import * as THREE from "three";

/** Sun height above the horizon beyond which stars fade out entirely. */
const STARFIELD_FADE_HEIGHT = 5;

/**
 * Star opacity for a given sun height.
 *
 * Pure so the fade can be unit tested in isolation. Full opacity (1) while
 * the sun is at or below the horizon, ramping down to 0 once it climbs above
 * {@link STARFIELD_FADE_HEIGHT}.
 *
 * @param sunHeight - The sun's Y position (world units; negative is below horizon).
 * @returns Opacity in `[0, 1]`.
 */
export const computeStarfieldOpacity = (sunHeight: number): number => {
  if (sunHeight <= 0) {
    return 1;
  }

  return Math.max(0, 1 - sunHeight / STARFIELD_FADE_HEIGHT);
};

/**
 * Rotates the starfield sphere to match the sun's orbit.
 *
 * The starfield is a fixed sphere centered at the world origin. This system
 * rotates the sphere around the sun's orbit axis so the visible patch sweeps
 * across the stars as the sun moves. The sphere's uniform distribution means
 * the stars appear to rotate with the sun, creating the visual effect of a
 * surrounding star sphere that moves along with the sun across the landscape.
 */
export const starfieldSystem: SceneSystem = (world, _scene, _dt) => {
  if (world.isPaused) {
    return;
  }

  const starfield = getStarfieldResource();
  const starPoints = starfield.children[0] as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  const streakLines = starfield.children[1] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  // Orbit axis: the normal to the sun's orbit plane.
  // The sun orbits in a plane tilted by inclination (π/4) around the X axis.
  // Sun position: x = r·cos(θ), y = r·sin(θ)·sin(i), z = r·sin(θ)·cos(i)
  // Plane normal = (1,0,0) × (0, sin(i), cos(i)) = (0, -cos(i), sin(i))
  const inclination = Math.PI / 4;
  const orbitAxis = new THREE.Vector3(0, -Math.cos(inclination), Math.sin(inclination)).normalize();

  // Rotate the starfield sphere around the orbit axis to match the sun's angle.
  // Since the sphere is uniformly distributed, rotating it changes which stars
  // are in the visible patch, giving the appearance of a rotating starfield.
  starfield.quaternion.setFromAxisAngle(orbitAxis, world.sunAngle);

  const opacity = computeStarfieldOpacity(world.sunPosition.y);
  starfield.visible = opacity > 0.02;

  (starPoints.material as THREE.PointsMaterial).opacity = opacity;
  (streakLines.material as THREE.LineBasicMaterial).opacity = opacity;
};