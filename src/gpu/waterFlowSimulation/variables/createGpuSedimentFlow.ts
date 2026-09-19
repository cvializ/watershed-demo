import type {
  GPUComputationRenderer,
  Variable,
} from "three/addons/misc/GPUComputationRenderer.js";

import * as THREE from "three";

import sedimentFlowFragmentShader from "@/shaders/compute/sediment-flow.frag?raw";
import { logger } from "@/utils/logger";
import { getUniforms } from "@/utils/uniformUtils";

/**
 * Uniforms for the sediment flow computation.
 *
 * Only custom textures and scalar parameters live here. The fields this shader reads from other
 * simulation variables (waterVelocity / waterHeight / heightMap / sedimentFlow) are injected by
 * GPUComputationRenderer from the declared dependencies, so they must not appear in this type.
 */
export type SedimentFlowUniforms = {
  uBaseHeightMap: THREE.IUniform<THREE.Texture>;
  surfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  erosionCoefficient: THREE.IUniform<number>;
  capacityExponent: THREE.IUniform<number>;
  criticalSpeed: THREE.IUniform<number>;
  detachRate: THREE.IUniform<number>;
  settleRate: THREE.IUniform<number>;
  transferCap: THREE.IUniform<number>;
  erodibleDepth: THREE.IUniform<number>;
  dtScale: THREE.IUniform<number>;
  reposeTangent: THREE.IUniform<number>;
  relaxRate: THREE.IUniform<number>;
  texelSpan: THREE.IUniform<number>;
};

// Defaults from plan addendum A8.
const DEFAULT_EROSION_COEFFICIENT = 0.01;
const DEFAULT_CAPACITY_EXPONENT = 1.5;
const DEFAULT_CRITICAL_SPEED = 0.02;
const DEFAULT_DETACH_RATE = 0.004;
const DEFAULT_SETTLE_RATE = 0.06;
const DEFAULT_TRANSFER_CAP = 0.5;
const DEFAULT_ERODIBLE_DEPTH = 0.35;

/**
 * Granular relaxation defaults: tan(60 degrees), i.e. a deliberately steep angle of repose.
 *
 * Measured over the initial field on the production grid (512 texels across the 12 unit plane, so one texel spans
 * 0.0234 world units): the analytic crests already put 1.96% of all cell edges steeper than 60 degrees and 7.2%
 * steeper than 50 degrees, while a 35 degree repose would slump 24% of the map. Steep is what makes this spike
 * relief rather than landscape erosion - those few percent are the texel-scale crests, and they slump once at
 * startup instead of being shaved off over the whole terrain.
 */
const DEFAULT_REPOSE_TANGENT = 1.7320508;
const DEFAULT_RELAX_RATE = 0.25;

// Frame-rate coupling (plan S6): coefficients are per-frame, dtScale keeps a stalled frame from
// exporting more than the cap allows. Clamped on both ends.
const TARGET_FRAMES_PER_SECOND = 60;
const MIN_DT_SCALE = 0.25;
const MAX_DT_SCALE = 2.0;

/**
 * Module-private 1x1 all-dirt texture, used when no surface material map is supplied so the
 * sampler is never null (plan A8: this is what lets `uHasSurfaceMaterialMap` go away).
 */
const createDirtTextureSource = () => {
  let cached: THREE.DataTexture | null = null; // one shared GPU texture, allocated on first use
  return (): THREE.DataTexture => {
    if (!cached) {
      cached = new THREE.DataTexture(
        new Float32Array([0.0, 0.0, 0.0, 1.0]), // r = bare dirt material id
        1,
        1,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      cached.needsUpdate = true;
    }
    return cached;
  };
};
const getDirtTexture = createDirtTextureSource();

/**
 * Creates an initial sediment flow texture with zero values for all cells.
 */
const createInitialSedimentFlowTexture = (
  size: number,
): { texture: THREE.DataTexture; data: Float32Array } => {
  const data = new Float32Array(size * size * 4); // RGBA

  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 0.0; // R: transport direction X
    data[i * 4 + 1] = 0.0; // G: transport direction Y
    data[i * 4 + 2] = 0.0; // B: suspended load (bed-equivalent height units)
    data[i * 4 + 3] = 0.0; // A: signed bed delta scheduled for the bed (D - E)
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;

  return { texture, data };
};

/**
 * Creates the sediment flow computation.
 *
 * `texelSpan` is the world width of one simulation texel (`terrainSize / width`). The shader's angle of repose is a
 * geometric slope, so it needs that span to turn into a height threshold; hard-coding the threshold instead would
 * make the resting angle change whenever the grid resolution does.
 *
 * Dependencies are declared exactly once, here (plan S2): routing velocity and flow depth set
 * transport capacity, the dynamic bed supplies elevation plus erodible-soil availability, and the
 * self-dependency carries the previous suspended load. Every cross-variable read is therefore the
 * last committed frame through a sampler GCR injects under the dependency's own name - which is
 * what replaces the one-time custom-uniform binds that pinned a single ping-pong buffer (S1).
 */
export const createGpuSedimentFlow = (
  gpuCompute: GPUComputationRenderer,
  width: number,
  texelSpan: number,
  baseHeightMapTexture: THREE.Texture,
  waterVelocityVariable: Variable,
  waterHeightVariable: Variable,
  heightMapVariable: Variable,
  surfaceMaterialMap?: THREE.Texture | null,
  savedTexture?: THREE.DataTexture,
) => {
  logger.info("[gpu:sediment-flow:create]");

  // Use saved texture if provided, otherwise create initial texture
  const sedimentFlowTexture =
    savedTexture || createInitialSedimentFlowTexture(width).texture;
  const sedimentFlowVariable = gpuCompute.addVariable(
    "sedimentFlow",
    sedimentFlowFragmentShader,
    sedimentFlowTexture,
  );

  gpuCompute.setVariableDependencies(sedimentFlowVariable, [
    waterVelocityVariable, // routing direction + speed (source of truth)
    waterHeightVariable, // flow depth -> transport capacity, settling
    heightMapVariable, // bed elevation + erodible-soil availability
    sedimentFlowVariable, // self: previous suspended load
  ]);

  const uniforms = getUniforms<SedimentFlowUniforms>(
    sedimentFlowVariable.material,
  );
  uniforms.uBaseHeightMap = { value: baseHeightMapTexture };
  uniforms.surfaceMaterialMap = {
    value: surfaceMaterialMap ?? getDirtTexture(),
  };
  uniforms.erosionCoefficient = { value: DEFAULT_EROSION_COEFFICIENT };
  uniforms.capacityExponent = { value: DEFAULT_CAPACITY_EXPONENT };
  uniforms.criticalSpeed = { value: DEFAULT_CRITICAL_SPEED };
  uniforms.detachRate = { value: DEFAULT_DETACH_RATE };
  uniforms.settleRate = { value: DEFAULT_SETTLE_RATE };
  uniforms.transferCap = { value: DEFAULT_TRANSFER_CAP };
  uniforms.erodibleDepth = { value: DEFAULT_ERODIBLE_DEPTH };
  uniforms.dtScale = { value: 1.0 }; // neutral until the first update
  uniforms.reposeTangent = { value: DEFAULT_REPOSE_TANGENT };
  uniforms.relaxRate = { value: DEFAULT_RELAX_RATE };
  uniforms.texelSpan = { value: texelSpan };

  return {
    sedimentFlowVariable,
    /**
     * Re-scales the per-frame coefficients for this frame's elapsed time.
     */
    updateSedimentFlow: (deltaTime: number): void => {
      const dtScale = Math.min(
        MAX_DT_SCALE,
        Math.max(MIN_DT_SCALE, deltaTime * TARGET_FRAMES_PER_SECOND),
      );
      uniforms.dtScale.value = dtScale;
    },
    /**
     * Forwards the world erosion slider into transport capacity.
     */
    setErosionRate: (erosionRate: number): void => {
      uniforms.erosionCoefficient.value = erosionRate;
    },
    getSedimentFlowUniforms: () => {
      return getUniforms<SedimentFlowUniforms>(sedimentFlowVariable.material);
    },
  };
};
