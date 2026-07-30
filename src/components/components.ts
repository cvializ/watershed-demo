import { f32, str } from "bitecs/serialization";

/** Tag components */
export const Camera = {};
export const Terrain = {};

export const Renderable = {};
export const Hidden = {};

export const Name = {
  value: str([]),
};

export const Position = {
  x: f32([]),
  y: f32([]),
  z: f32([]),
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
