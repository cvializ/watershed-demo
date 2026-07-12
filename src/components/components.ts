// --- ECS Components (Structure of Arrays) ---
import { f32, str } from "bitecs/serialization";

/** Position and rotation state — pure numeric data */
export const Transform = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
  rx: f32([]), // radians
  ry: f32([]),
  rz: f32([]),
};

/** Tag components */
export const Camera = {};
export const Terrain = {};
export const Default = {};
export const Rotate = {};

/** Position-only data — for entities like cameras that don't need rotation.
 *  Separate from Transform to keep concerns apart (meshes use full Transform,
 *  cameras only need position). */
export const Position = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
};

export const MeshRef = {
  ref: f32([]),
};
export const TextureRef = {
  ref: f32([]),
};
export const MaterialRef = {
  ref: str([]),
};

/** Per-entity velocity vector in world units / second. Read by physics/movement systems and applied to Position via dt. Arrow keys set this on the camera entity; WASD+QE bindings are removed. */
export const Velocity = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
};
