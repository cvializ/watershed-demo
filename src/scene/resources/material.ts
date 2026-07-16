import * as THREE from "three";

import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";

export const materialCache = new Map<string, THREE.Material>();

export const getMaterial = (uuid: string) => {
  return materialCache.get(uuid) as THREE.Material;
};

export const createDefaultMaterialResource = () => {
  const material = new THREE.MeshPhongMaterial({
    color: 0x8B4513, // Brownish terrain color
    flatShading: false,
  }) as THREE.MeshPhongMaterial;
  materialCache.set(material.uuid, material);

  return {
    materialId: material.uuid,
  };
};

/**
 * Create a shader material that visualizes water flowing on terrain
 * The water heightmap should be updated via GPU computation simulation
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
  const minHeight: number = -1.5;
  const maxHeight: number = 2.0;

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

  return {
    materialId: material.uuid,
  };
};
