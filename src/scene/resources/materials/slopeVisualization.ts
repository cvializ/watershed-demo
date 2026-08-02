import * as THREE from "three";

import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";

type SlopeVisualizationUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uHeightMapSize: THREE.IUniform<THREE.Vector2>;
  uMinSlope: THREE.IUniform<number>;
  uMaxSlope: THREE.IUniform<number>;
};

/**
 * Create a shader material that visualizes terrain slope using surface normals
 */
export type SlopeVisualizationOptions = {
  heightmap: THREE.Texture;
};

export const createSlopeVisualizationMaterialResource = ({
  heightmap,
}: SlopeVisualizationOptions) => {
  const uniforms: SlopeVisualizationUniforms = {
    uHeightMap: { value: heightmap },
    uHeightMapSize: { value: new THREE.Vector2(512, 512) },
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
