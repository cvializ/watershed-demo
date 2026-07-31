import * as THREE from "three";

import { getObject, setObject } from "@/scene/resources/objectCache";

export const TextureEnum = {
  DefaultHeightMap: "DefaultHeightMap",
  HeightMap: "HeightMap",
  WaterHeightMap: "WaterHeightMap",
  CloudShadowMap: "CloudShadowMap",
  VelocityMap: "VelocityMap",
  Simulation: "Simulation",
  TestingTexture: "TestingTexture",
} as const;

export type TextureEnum = (typeof TextureEnum)[keyof typeof TextureEnum];

export const setTexture = (id: TextureEnum, value: THREE.Texture) => {
  setObject(id, value);
};

export const getTexture = (id: TextureEnum) => {
  return getObject(id) as THREE.Texture;
};
