import * as THREE from "three";

import { getObject, setObject } from "@/scene/resources/objectCache";
import { getTexture, TextureEnum } from "@/scene/resources/texture";
import heightVisualizationFrag from "@/shaders/height-visualization.frag?raw";
import heightVisualizationVert from "@/shaders/height-visualization.vert?raw";
import pulsingSimulationFrag from "@/shaders/pulsing-visualization.frag?raw";
import pulsingSimulationVert from "@/shaders/pulsing-visualization.vert?raw";
import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";
import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";
import { logger } from "@/utils/logger";

type HeightVisualizationUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uMinHeight: THREE.IUniform<number>;
  uMaxHeight: THREE.IUniform<number>;
};

type SlopeVisualizationUniforms = {
  uMinSlope: THREE.IUniform<number>;
  uMaxSlope: THREE.IUniform<number>;
};

export type PulsingVisualizationUniforms = {
  uPulsingTexture: THREE.IUniform<THREE.Texture>;
};

export type WaterVisualizationUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uWaterHeightmap: THREE.IUniform<THREE.Texture>;
  uCloudShadowMap: THREE.IUniform<THREE.Texture>;
  uVelocityMap: THREE.IUniform<THREE.Texture>;
  uMinHeight: THREE.IUniform<number>;
  uMaxHeight: THREE.IUniform<number>;
  uShowVelocity: THREE.IUniform<number>;
  uSurfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  uLightPosition: THREE.IUniform<THREE.Vector3>;
  uLightSpaceMatrix: THREE.IUniform<THREE.Matrix4>;
};

/**
 * Create a shader material that visualizes terrain height using a color palette
 */
const createHeightVisualizationMaterialResource = ({
  heightmap,
}: {
  heightmap: THREE.Texture;
}) => {
  const uniforms: HeightVisualizationUniforms = {
    uHeightMap: { value: heightmap },
    uMinHeight: { value: -1.5 },
    uMaxHeight: { value: 2.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: heightVisualizationVert,
    fragmentShader: heightVisualizationFrag,
    side: THREE.DoubleSide,
  });
};

/**
 * Create a shader material that visualizes terrain slope using surface normals
 */
const createSlopeVisualizationMaterialResource = () => {
  const uniforms: SlopeVisualizationUniforms = {
    uMinSlope: { value: 0.0 },
    uMaxSlope: { value: 2.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: slopeVisualizationVert,
    fragmentShader: slopeVisualizationFrag,
    side: THREE.DoubleSide,
  });
};

/**
 * Create a line basic material for downslope arrows visualization
 */
const createDownslopeArrowsMaterialResource = () => {
  return new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 1,
    transparent: true,
    opacity: 0.8,
  });
};

/**
 * Create a mesh normal material for verification/debugging
 */
const createNormalMaterialResource = () => {
  return new THREE.MeshNormalMaterial({});
};

/**
 * Create a shader material that visualizes the pulsing texture simulation
 */
const createPulsingVisualizationMaterialResource = ({
  pulsingTexture,
}: {
  pulsingTexture: THREE.Texture;
}) => {
  const uniforms: PulsingVisualizationUniforms = {
    uPulsingTexture: { value: pulsingTexture },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pulsingSimulationVert,
    fragmentShader: pulsingSimulationFrag,
    side: THREE.DoubleSide,
  });
};

/**
 * Create a shader material that visualizes water flowing on terrain
 * This is the main water shader that manages each of the overlays.
 */
const createWaterVisualizationMaterialResource = ({
  heightmap,
  waterHeightMap,
  cloudShadowMap,
  velocityMap,
  sunLightPosition,
}: {
  heightmap: THREE.Texture;
  waterHeightMap: THREE.Texture;
  cloudShadowMap: THREE.Texture;
  velocityMap: THREE.Texture;
  sunLightPosition: THREE.Vector3;
}) => {
  const minHeight = -1.5;
  const maxHeight = 2.0;

  const uniforms: Partial<WaterVisualizationUniforms> = {
    uHeightMap: { value: heightmap },
    uWaterHeightmap: { value: waterHeightMap },
    uCloudShadowMap: { value: cloudShadowMap },
    uVelocityMap: { value: velocityMap },
    uMinHeight: { value: minHeight },
    uMaxHeight: { value: maxHeight },
    uShowVelocity: { value: 1 },
    // uSurfaceMaterialMap: { value: null }, // Surface material texture (not yet implemented)
    uLightPosition: { value: sunLightPosition.clone() },
    uLightSpaceMatrix: { value: new THREE.Matrix4() },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: waterVisualizationVert,
    fragmentShader: waterVisualizationFrag,
    side: THREE.DoubleSide,
  });
};

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

export const initSceneMaterialResources = () => {
  logger.info("[material:init]");

  const createDefaultMaterialResource = () => {
    return new THREE.MeshPhongMaterial({
      color: 0x8b4513, // Brownish terrain color
      flatShading: false,
    }) as THREE.MeshPhongMaterial;
  };

  setObject(MaterialEnum.Default, createDefaultMaterialResource());
  setObject(
    MaterialEnum.HeightVisualization,
    createHeightVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
    }),
  );
  setObject(MaterialEnum.Normal, createNormalMaterialResource());
  setObject(
    MaterialEnum.DownslopeArrowsMaterial,
    createDownslopeArrowsMaterialResource(),
  );
  setObject(MaterialEnum.Slope, createSlopeVisualizationMaterialResource());
  setObject(
    MaterialEnum.WaterFlow,
    createWaterVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
      waterHeightMap: getTexture(TextureEnum.WaterHeightMap),
      cloudShadowMap: getTexture(TextureEnum.CloudShadowMap),
      velocityMap: getTexture(TextureEnum.VelocityMap),
      sunLightPosition: new THREE.Vector3(0, 0, 0),
    }),
  );
  setObject(
    MaterialEnum.PulsingSimulation,
    createPulsingVisualizationMaterialResource({
      pulsingTexture: getTexture(TextureEnum.PulsingTexture),
    }),
  );
};
