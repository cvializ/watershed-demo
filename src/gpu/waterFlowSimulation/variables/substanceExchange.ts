import type * as THREE from "three";

/**
 * The single source of truth for the substance exchange between a water film and the ground beneath it.
 *
 * Two shaders evaluate this law, not one: `src/shaders/compute/water-quality.frag` moves bacteria out of the
 * water column and `src/shaders/compute/terrain-quality.frag` puts exactly that amount into the ground (and the
 * other way round for wash-off). They do so by re-evaluating the same pure helper on the same committed texel,
 * which is how sediment-flow.frag and terrain-height.frag already move a bed delta without minting or destroying
 * mass. Because GPUComputationRenderer binds every dependency to the last committed frame of a pass, both sides
 * see identical depth, identical masses and - thanks to this object - identical rates, so each pair of legs is
 * balanced by construction rather than by luck.
 *
 * The organic-matter leg only runs one way. Loose manure on the ground is flimsy material that a sheet of water
 * scours off easily, so it washes into the film readily; nothing carries water-borne organic matter back out of the
 * flow and into the soil, so there is no attach rate for it - what the stream is holding stays in the film until it
 * decays or drains (see terrain-quality.frag).
 *
 * Every fraction is a per-pass coefficient at 60 fps, scaled by dtScale and clamped in the shaders; they are tuned
 * for "the bed starts reading within a few seconds of plume arrival" and calibrated to nothing.
 */
export const SUBSTANCE_EXCHANGE_RATES = {
  /** Fraction of a wet cell's water bacteria attaching to the ground per pass */
  soilAttachRate: 0.02,
  /** Fraction of that ground's bacteria washing back into standing water per pass */
  washOffRate: 0.008,
  /**
   * Fraction of a wet cell's ground organic matter its film picks up per pass. Several times the bacterial
   * wash-off rate because manure is loose material rather than something sticking to soil grains.
   */
  organicWashOffRate: 0.06,
} as const;

/**
 * The exchange uniforms every shader applying the law declares - same names, same values, both sides.
 */
export type SubstanceExchangeUniforms = {
  soilAttachRate: THREE.IUniform<number>;
  washOffRate: THREE.IUniform<number>;
  organicWashOffRate: THREE.IUniform<number>;
};
