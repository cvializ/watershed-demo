import { f32, str } from "bitecs/serialization";

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

export const Rotate = {};

export const Default = {};
export const HeightMap = {};

export const Hidden = {};

// Simple relation with no data

export const WaterSimulation = {};

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

export const Renderable = {};

export const Wireframe = {};
