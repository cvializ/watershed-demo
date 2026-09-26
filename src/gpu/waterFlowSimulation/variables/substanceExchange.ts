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
 * The bacterial deposit is conditional in a way the other legs are not. Water carries bacteria wherever it flows,
 * but they only drop out of it where the soil has organic matter for them to live on, scaled by how much of that
 * carbon is present (see ORGANIC_DEPOSIT_THRESHOLD): a film crossing clean gravel keeps its load, a film crossing
 * a manure pat hands over `soilDepositRate` of it, and a film crossing a thin scatter of leaves takes the
 * proportional middle. A dry bed still trades nothing, because there is no film to trade with.
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
  /**
   * Fraction of a wet cell's water bacteria that its soil's organic matter catches per pass - which is only ever
   * paid when the soil holds organic matter at all, since the rate below is scaled by ORGANIC_DEPOSIT_THRESHOLD.
   */
  soilDepositRate: 0.06,
  /** Fraction of that ground's bacteria washing back into standing water per pass */
  washOffRate: 0.008,
  /**
   * Fraction of a wet cell's ground organic matter its film picks up per pass. Several times the bacterial
   * wash-off rate because manure is loose material rather than something sticking to soil grains.
   */
  organicWashOffRate: 0.06,
} as const;

/**
 * Soil organic per cell at, or above, which the bacterial deposit above runs at its full rate. Below it the deposit
 * scales down with the carbon that is there, and a cell with none deposits nothing - which is the whole point: a
 * stream carries bacteria across ground that offers them no purchase and deposits them where it crosses something
 * they can feed on. Not calibrated to anything; it only has to sit in the range a pat or a leaf scatter actually
 * reaches (an animal drops 0.5 per pass, mineralising at 0.004, so a grazed cell clears this mark quickly).
 */
export const ORGANIC_DEPOSIT_THRESHOLD = 0.1;

/**
 * The exchange uniforms every shader applying the law declares - same names, same values, both sides.
 */
export type SubstanceExchangeUniforms = {
  soilDepositRate: THREE.IUniform<number>;
  organicDepositThreshold: THREE.IUniform<number>;
  washOffRate: THREE.IUniform<number>;
  organicWashOffRate: THREE.IUniform<number>;
};

/**
 * The single source of truth for bacteria growing on organic matter, as distinct from the exchange above.
 *
 * Neither of these numbers is a transfer, so `exchangeAt` is not where they belong: nothing crosses the
 * water/ground boundary here. Each compartment converts the organic matter it already holds into bacteria - the
 * film eats what is dissolved or suspended in it, the soil eats what lies on it - which is why one copy of this
 * law in each shader is enough and why the two do not have to read the same texel to agree.
 *
 * It is a conversion, not minting: `converted` is taken out of one channel and put into the other, so a cell's
 * organic plus bacterial mass only changes by what decay removes. That is what keeps a pat finite - it feeds the
 * stream until it has all been eaten, then stops - and what lets the tests hold `organic + bacteria` to one
 * number instead of excusing an unbounded population.
 *
 * Two terms, both paid out of the organic:
 * - `organicConversionRate` is colonisation. Organic matter arrives carrying bacteria, so a cell that has never
 *   seen either of them still gets a seed whenever there is carbon to seed on and water to do it in. Without this
 *   term a clean catchment could never turn magenta, since nothing else ever introduces bacteria here.
 * - `growthGain` scales with the population already in that compartment, so an established colony works through
 *   its food faster than a trace of one and a plume visibly grows as it travels.
 *
 * Both are gated by wetness, like the whole exchange law: a dry pat weathers by mineralisation alone, and a dry
 * cell's residue does not multiply in air. `growthCeiling` is the per-pass cap on the combined rate, so a
 * two-frame pass cannot eat a whole cell's carbon in one step.
 */
export const BACTERIA_GROWTH = {
  /** Fraction of a compartment's organic matter that colonises into bacteria per pass, seed and all */
  organicConversionRate: 0.08,
  /** Extra fraction converted per unit of population already in that compartment, so colonies grow faster */
  growthGain: 0.06,
  /** Ceiling on that combined per-pass rate, scaled by dtScale in the shaders like every other coefficient */
  growthCeiling: 0.25,
} as const;

/**
 * The growth uniforms both quality shaders declare - same names, same values, both sides, and both applied to
 * their own compartment's channels rather than to a shared ledger.
 */
export type SubstanceGrowthUniforms = {
  organicConversionRate: THREE.IUniform<number>;
  growthGain: THREE.IUniform<number>;
};
