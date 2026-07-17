import * as THREE from "three";

import heightVisualizationFrag from "@/shaders/height-visualization.frag?raw";
import heightVisualizationVert from "@/shaders/height-visualization.vert?raw";
import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";
import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";

export const materialCache = new Map<string, THREE.Material>();

// Cache materials by visualization mode to avoid recreating them
const vizModeMaterialCache = new Map<number, string>();

export const getMaterial = (uuid: string) => {
  return materialCache.get(uuid) as THREE.Material;
};

const setMaterial = (material: THREE.Material) => {
  materialCache.set(material.uuid, material);
};

export const createDefaultMaterialResource = () => {
  // Check if we already created this material
  const existingUuid = vizModeMaterialCache.get(3); // Mode 3 is default material for downslope
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const material = new THREE.MeshPhongMaterial({
    color: 0x8b4513, // Brownish terrain color
    flatShading: false,
  }) as THREE.MeshPhongMaterial;
  setMaterial(material);
  vizModeMaterialCache.set(3, material.uuid);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a shader material that visualizes terrain height using a color palette
 */
export const createHeightVisualizationMaterialResource = ({
  heightmap,
}: {
  heightmap: THREE.Texture;
}) => {
  // Check if we already created this material
  const existingUuid = vizModeMaterialCache.get(0); // Mode 0 is height visualization
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const minHeight = -1.5;
  const maxHeight = 2.0;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightmap },
      uMinHeight: { value: minHeight },
      uMaxHeight: { value: maxHeight },
    },
    vertexShader: heightVisualizationVert,
    fragmentShader: heightVisualizationFrag,
    side: THREE.DoubleSide,
  });
  setMaterial(material);
  vizModeMaterialCache.set(0, material.uuid);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a shader material that visualizes terrain slope using surface normals
 */
export const createSlopeVisualizationMaterialResource = () => {
  // Check if we already created this material
  const existingUuid = vizModeMaterialCache.get(1);
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMinSlope: { value: 0.0 },
      uMaxSlope: { value: 2.0 },
    },
    vertexShader: slopeVisualizationVert,
    fragmentShader: slopeVisualizationFrag,
    side: THREE.DoubleSide,
  });
  setMaterial(material);
  vizModeMaterialCache.set(1, material.uuid);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a line basic material for downslope arrows visualization
 */
export const createDownslopeArrowMaterialResource = () => {
  // Check if we already created this material
  const existingUuid = vizModeMaterialCache.get(3); // Mode 3 is downslope arrows
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 1,
    transparent: true,
    opacity: 0.8,
  });
  setMaterial(material);
  vizModeMaterialCache.set(3, material.uuid);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a mesh normal material for verification/debugging
 */
export const createNormalMaterialResource = () => {
  // Check if we already created this material
  const existingUuid = vizModeMaterialCache.get(2);
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const material = new THREE.MeshNormalMaterial({});
  setMaterial(material);
  vizModeMaterialCache.set(2, material.uuid);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a shader material that visualizes water flowing on terrain
 */
export const createWaterVisualizationMaterialResource = ({
  heightmap,
  waterHeightMap,
  cloudShadowMap,
  velocityMap,
  sunLight,
}: {
  heightmap: THREE.Texture;
  waterHeightMap: THREE.Texture;
  cloudShadowMap: THREE.Texture;
  velocityMap: THREE.Texture;
  sunLight: THREE.DirectionalLight;
}) => {
  // Check if we already created this material with the same textures
  const existingUuid = vizModeMaterialCache.get(4);
  if (existingUuid) {
    return { materialId: existingUuid };
  }

  const minHeight = -1.5;
  const maxHeight = 2.0;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightmap },
      uWaterHeightmap: { value: waterHeightMap },
      uCloudShadowMap: { value: cloudShadowMap },
      uVelocityMap: { value: velocityMap },
      uMinHeight: { value: minHeight },
      uMaxHeight: { value: maxHeight },
      uShowVelocity: { value: 1 },
      // Shadow calculation uniforms
      uLightPosition: { value: sunLight.position.clone() },
      uLightSpaceMatrix: { value: new THREE.Matrix4() },
    },
    vertexShader: waterVisualizationVert,
    fragmentShader: waterVisualizationFrag,
    side: THREE.DoubleSide,
  });
  materialCache.set(material.uuid, material);
  vizModeMaterialCache.set(4, material.uuid);

  return {
    materialId: material.uuid,
  };
};
