import * as THREE from "three";

import { getObject } from "@/scene/resources/objectCache";

export type {
  PulsingVisualizationUniforms,
} from "@/scene/resources/materials/pulsingVisualization";
export type {
  WaterVisualizationUniforms,
} from "@/scene/resources/materials/waterVisualization";

export const MaterialEnum = {
  Default: "Default",
  HeightVisualization: "HeightVisualization",
  Normal: "Normal",
  DownslopeArrowsMaterial: "DownslopeArrowsMaterial",
  Slope: "Slope",
  WaterFlow: "WaterFlow",
  PulsingSimulation: "PulsingSimulation",
} as const;

export type MaterialEnum = (typeof MaterialEnum)[keyof typeof MaterialEnum];

export const getMaterial = (id: MaterialEnum) => {
  return getObject(id) as THREE.Material;
};