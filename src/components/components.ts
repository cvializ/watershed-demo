import { f32, str } from "bitecs/serialization";

/** Tag components */
export const Camera = {};
export const Terrain = {};
export const Animal = {};

/**
 * Tag component: this entity is a first-person viewpoint - a place to stand
 * and look at the scene from. Its world position comes from `Position` and
 * the direction it faces from `Orientation` (a world-space quaternion); the
 * matching first-person camera lives in the per-entity cache in
 * `scene/resources/viewpoint.ts`.
 */
export const Viewpoint = {};

export const Renderable = {};
export const Hidden = {};

/** Tag component: this entity was right-clicked and is shown in the inspector pane. */
export const Selected = {};

export const Name = {
  value: str([]),
};

export const Position = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
};

export const Velocity = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
};

/**
 * World-space orientation stored as a quaternion (x, y, z, w).
 *
 * Used by first-person `Viewpoint` entities to record the direction the
 * viewer faces. The stored quaternion is applied directly to the entity's
 * camera, so a viewpoint always renders exactly as it was placed even if the
 * terrain under it changes shape.
 */
export const Orientation = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
  w: f32([]),
};

export const MeshRef = {
  ref: str([]),
};

export const MaterialRef = {
  ref: str([]),
};

export const ObjectRef = {
  ref: str([]),
};
