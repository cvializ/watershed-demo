import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import pulsingFragmentShader from "@/shaders/compute/pulsing.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * Uniform structure for pulsing texture computation shader.
 */
export type PulsingUniforms = {
  uTime: THREE.IUniform<number>;
};

/**
 * Creates an initial texture for the pulsing simulation.
 */
const createInitialPulsingTexture = (
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
  logger.debug({ size }, "Initial pulsing texture created");
  return { texture, data };
};

export const createPulsingTexture = (
  gpuCompute: GPUComputationRenderer,
  width: number,
): {
  pulsingVariable: Variable;
  initPulsing: () => void;
  updatePulsing: (gameTime: number) => void;
} => {
  logger.info("[gpu:pulsing:create]");

  const { texture: pulsingTexture } = createInitialPulsingTexture(width);
  const pulsingVariable = gpuCompute.addVariable(
    "pulsing",
    pulsingFragmentShader,
    pulsingTexture,
  );

  const uniforms = getUniforms<PulsingUniforms>(pulsingVariable.material);
  uniforms.uTime = { value: 0.0 };

  return {
    pulsingVariable,
    initPulsing: () => {
      // Initial uniform setup
    },
    updatePulsing: (gameTime: number) => {
      logger.info({ gameTime }, "[pulsing:update] Updating uTime uniform");
      uniforms.uTime.value = gameTime;
    },
  };
};
