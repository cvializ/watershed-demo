import * as THREE from "three";

import testingSimulationFrag from "@/shaders/testing-visualization.frag?raw";
import testingSimulationVert from "@/shaders/testing-visualization.vert?raw";

export type TestingVisualizationUniforms = {
  uTestingTexture: THREE.IUniform<THREE.Texture>;
};

/**
 * Create a shader material that visualizes the testing texture simulation
 */
export const createTestingVisualizationMaterialResource = ({
  testingTexture,
}: {
  testingTexture: THREE.Texture;
}) => {
  const uniforms: TestingVisualizationUniforms = {
    uTestingTexture: { value: testingTexture },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: testingSimulationVert,
    fragmentShader: testingSimulationFrag,
    side: THREE.DoubleSide,
  });
};
