import * as THREE from "three";

import { getTexture, TextureEnum } from "@/scene/resources/texture";
import heightVisualizationFrag from "@/shaders/height-visualization.frag?raw";
import heightVisualizationVert from "@/shaders/height-visualization.vert?raw";
import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";
import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";

export const createDefaultMaterialResource = () => {
  return new THREE.MeshPhongMaterial({
    color: 0x8b4513, // Brownish terrain color
    flatShading: false,
  }) as THREE.MeshPhongMaterial;
};

export type HeightVisualizationUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uMinHeight: THREE.IUniform<number>;
  uMaxHeight: THREE.IUniform<number>;
};

/**
 * Create a shader material that visualizes terrain height using a color palette
 */
export const createHeightVisualizationMaterialResource = ({
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

type SlopeVisualizationUniforms = {
  uMinSlope: THREE.IUniform<number>;
  uMaxSlope: THREE.IUniform<number>;
};

/**
 * Create a shader material that visualizes terrain slope using surface normals
 */
export const createSlopeVisualizationMaterialResource = () => {
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
export const createDownslopeArrowsMaterialResource = () => {
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
export const createNormalMaterialResource = () => {
  return new THREE.MeshNormalMaterial({});
};

/**
 * Uniform structure for water visualization shader.
 */
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
 * Create a shader material that visualizes water flowing on terrain
 * This is the main water shader that manages each of the overlays.
 */
export const createWaterVisualizationMaterialResource = ({
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
  DownslopeArrows: "DownslopeArrows",
  Slope: "Slope",
  WaterFlow: "WaterFlow",
} as const;

export type MaterialEnum = (typeof MaterialEnum)[keyof typeof MaterialEnum];

const enumCache = new Map<MaterialEnum, THREE.Material>();

export const getMaterial = (id: MaterialEnum) => {
  const material = enumCache.get(id);
  if (!material) {
    throw new Error(`Could not find material ${id}`);
  }
  return material;
};

export const setMaterial = (id: MaterialEnum, value: THREE.Material) => {
  enumCache.set(id, value);
};

export const initSceneMaterialResources = () => {
  enumCache.set(MaterialEnum.Default, createDefaultMaterialResource());
  enumCache.set(
    MaterialEnum.HeightVisualization,
    createHeightVisualizationMaterialResource({
      heightmap: getTexture(TextureEnum.DefaultHeightMap),
    }),
  );
  enumCache.set(MaterialEnum.Normal, createNormalMaterialResource());
  enumCache.set(MaterialEnum.DownslopeArrows, createDownslopeArrowsMaterialResource());
  enumCache.set(MaterialEnum.Slope, createSlopeVisualizationMaterialResource());
};
