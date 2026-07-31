import * as THREE from "three";

import heightVisualizationFrag from "@/shaders/height-visualization.frag?raw";
import heightVisualizationVert from "@/shaders/height-visualization.vert?raw";

type HeightVisualizationUniforms = {
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
