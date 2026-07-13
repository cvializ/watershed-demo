import * as THREE from "three";

import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";

/**
 * Create a shader material that visualizes water flowing on terrain
 * The water heightmap should be updated via GPU computation simulation
 */
export function createWaterVisualizationMaterial(
  minHeight: number = -1.5,
  maxHeight: number = 2.0,
  heightMap?: THREE.Texture,
  velocityMap?: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMap || new THREE.Texture() },
      uWaterHeightmap: { value: new THREE.Texture() },
      uCloudShadowMap: { value: new THREE.Texture() },
      uVelocityMap: { value: velocityMap || new THREE.Texture() },
      uMinHeight: { value: minHeight },
      uMaxHeight: { value: maxHeight },
      uShowVelocity: { value: true },
    },
    vertexShader: waterVisualizationVert,
    fragmentShader: waterVisualizationFrag,
    side: THREE.DoubleSide,
  });
}
