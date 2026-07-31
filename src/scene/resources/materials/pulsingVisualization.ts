import * as THREE from "three";

import pulsingSimulationFrag from "@/shaders/pulsing-visualization.frag?raw";
import pulsingSimulationVert from "@/shaders/pulsing-visualization.vert?raw";

export type PulsingVisualizationUniforms = {
  uPulsingTexture: THREE.IUniform<THREE.Texture>;
};

/**
 * Create a shader material that visualizes the pulsing texture simulation
 */
export const createPulsingVisualizationMaterialResource = ({
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
