import * as THREE from "three";

import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";

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
