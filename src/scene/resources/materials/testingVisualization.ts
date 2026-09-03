import * as THREE from "three";

import testingSimulationFrag from "@/shaders/testing-visualization.frag?raw";
import testingSimulationVert from "@/shaders/testing-visualization.vert?raw";

export type TestingVisualizationUniforms = {
  uTestingTexture: THREE.IUniform<THREE.Texture>;
  uDeltaScale: THREE.IUniform<number>;
};

// Brightness of the deposition/erosion overlay. The shader normalises its signed bed delta by this
// uniform instead of a literal, so the debug view can be re-scaled per plan S9; this value matches the
// hard-coded factor the shader used before, keeping the on-screen magnitude unchanged.
const DEFAULT_DELTA_SCALE = 5.0;

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
    uDeltaScale: { value: DEFAULT_DELTA_SCALE },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: testingSimulationVert,
    fragmentShader: testingSimulationFrag,
    side: THREE.DoubleSide,
  });
};
