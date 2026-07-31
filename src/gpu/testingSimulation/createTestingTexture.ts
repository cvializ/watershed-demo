import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import testingFragmentShader from "@/shaders/compute/testing.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * Uniform structure for testing texture computation shader.
 */
type TestingUniforms = {
  uTime: THREE.IUniform<number>;
};

/**
 * Creates an initial texture for the testing simulation.
 */
const createInitialTestingTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA

  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 1.0; // R: white (starting value)
    data[i * 4 + 1] = 1.0; // G: white
    data[i * 4 + 2] = 1.0; // B: white
    data[i * 4 + 3] = 1.0; // A: alpha
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;
  logger.debug({ size }, "Initial testing texture created");
  return { texture, data };
};

export const createTestingTexture = (
  gpuCompute: GPUComputationRenderer,
  width: number,
): {
  testingVariable: Variable;
  initTesting: () => void;
  updateTesting: (gameTime: number) => void;
} => {
  logger.info("[gpu:testing:create]");

  const { texture: testingTexture } = createInitialTestingTexture(width);
  const testingVariable = gpuCompute.addVariable(
    "testing",
    testingFragmentShader,
    testingTexture,
  );

  const uniforms = getUniforms<TestingUniforms>(testingVariable.material);
  uniforms.uTime = { value: 0.0 };

  return {
    testingVariable,
    initTesting: () => {
      // Initial uniform setup
    },
    updateTesting: (gameTime: number) => {
      uniforms.uTime.value = gameTime;
    },
  };
};