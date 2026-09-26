#include <common>

// Dependency samplers waterHeight / waterQuality / terrainQuality are injected by GPUComputationRenderer from
// this variable's declared dependencies, so re-declaring them here would be a compile error (src/gpu/README.md,
// section 1). Only the custom uniforms below belong to this shader.

uniform float dtScale; // Frame-rate coupling, same convention and clamps as water-quality.frag (plan S6)
uniform float soilDecayRate; // Die-off of the ground population, first order like the water column's fade
uniform float organicDecayRate; // Mineralisation of the ground's organic matter, so pats weather away in place
uniform float soilDepositRate; // Shares its value with water-quality.frag via SUBSTANCE_EXCHANGE_RATES
uniform float organicDepositThreshold; // ...and so does this, the soil organic that saturates that deposit
uniform float washOffRate;    // ...and so does this one, which is what balances the ledger
uniform float organicWashOffRate; // ...and this fourth, which only ever runs ground -> water
uniform float organicConversionRate; // Growth of the ground population on the organic lying on it, same source as
uniform float growthGain; // ...the water column's: BACTERIA_GROWTH, so a pat and a plume agree on the law
uniform float uTerrainSize; // World size of the terrain: how deposit points map to texels, as in water-quality.frag
uniform int uDepositCount;
uniform vec4 uDepositPoints[8]; // (x, y, radius, amount) in world units; amount is mass per pass at 60 fps

// A film at least this deep counts as standing water. Same threshold water-visualization.frag uses to decide
// whether a cell reads as wet, and the same one water-quality.frag applies to dissolved oxygen, so "there is
// water here" means one thing across the simulation rather than three.
const float WET_DEPTH = 0.01;

// Smallest divisor the deposit's saturating ramp will use, matching water-quality.frag: the organic threshold is a
// tuned constant rather than user input, but a divide guarded at zero keeps a misconfigured ramp from going to
// infinity if someone ever sets it to nothing.
const float EPS = 1e-7;

// Most either direction of an exchange may hand over in a single pass. The ceiling is arithmetic rather than taste: a wet cell
// can be exporting FLUX_CEILING (0.75) of its bacteria to a downslope neighbour at the same time and is itself
// faded by up to DECAY_CEILING (0.25), so the ground may take at most (1 - 0.75) * (1 - 0.25) = 0.1875 of the
// committed population before the water column would go negative. 0.15 sits inside that with room to spare.
const float EXCHANGE_CEILING = 0.15;
const float DECAY_CEILING = 0.25;

// Most of a cell's organic matter this side may convert into bacteria in one pass - same ceiling as
// water-quality.frag, and for the same reason: it keeps the organic channel non-negative, since mineralisation
// (<= 0.25) and run-off (<= 0.15) draw on it too and 0.25 + 0.25 + 0.15 = 0.65 < 1. See BACTERIA_GROWTH.
const float GROWTH_CEILING = 0.25;

/**
 * The hand-over between this cell's water film and its ground, as the sides of one ledger.
 *
 * Textually identical to `exchangeAt` in src/shaders/compute/water-quality.frag: both shaders evaluate it on the
 * same committed texel (GPUComputationRenderer binds every dependency to the last committed frame of a pass), so
 * what leaves one compartment arrives in the other and neither side needs a renormalisation. Same trick as
 * sediment-flow.frag's outfluxAt, and for the same reason - transport authority stays with one owner and mass moves
 * rather than being minted (plan A4). Keep the two copies in step by hand; GLSL cannot import.
 *
 * Two species cross this boundary and they do not travel the same way. Bacteria go both directions, but only one of
 * those directions is conditional: they settle out of a film wherever the soil holds organic matter to live on, and a
 * film can pick them back up from the ground whether that food is still there or not. Organic matter only leaves the
 * ground - the flow has no mechanism for scraping material out of itself and burying it, so `toWaterOrganic` is the
 * organic leg's only term, and a cell that holds manure either keeps waiting or hands some to the water above it.
 */
void exchangeAt(
    vec2 uv,
    out float toTerrainBacteria,
    out float toWaterBacteria,
    out float toWaterOrganic
) {
    float depth = texture2D(waterHeight, uv).r;

    // Nothing trades across a dry bed: no film to carry anything down or lift it back up. What the ground is holding
    // simply waits there - which is the whole point of treating these substances as properties of the terrain as
    // well as of the water, and why a manure pat dries out in place instead of silently running off dry land.
    float wetness = clamp(depth / WET_DEPTH, 0.0, 1.0);

    // How much of the deposit the soil's carbon is worth: nothing where it has never been contaminated or grazed,
    // the full soilDepositRate at organicDepositThreshold and above, proportional in between. Both sides of the
    // ledger read this through the same committed terrainQuality texel, so the condition cannot disagree.
    float soilOrganic = max(texture2D(terrainQuality, uv).g, 0.0);
    float carbon = clamp(soilOrganic / max(organicDepositThreshold, EPS), 0.0, 1.0);

    // The deposit is gated by that carbon, so a film crossing clean gravel keeps its bacteria and one crossing a pat
    // hands them over. Wash-off deliberately is not: a population that banked itself in the bed stays banked there,
    // and only dies off (see soilDecayRate in terrain-quality.frag) unless a film lifts it back up.
    float deposit = min(soilDepositRate * dtScale, EXCHANGE_CEILING) * wetness * carbon;
    float washOff = min(washOffRate * dtScale, EXCHANGE_CEILING) * wetness;
    float organicRunoff = min(organicWashOffRate * dtScale, EXCHANGE_CEILING) * wetness;

    toTerrainBacteria = max(texture2D(waterQuality, uv).a, 0.0) * deposit;
    toWaterBacteria = max(texture2D(terrainQuality, uv).r, 0.0) * washOff;
    toWaterOrganic = max(texture2D(terrainQuality, uv).g, 0.0) * organicRunoff;
}

/**
 * How much of this compartment's organic matter its bacteria convert into more bacteria this pass.
 *
 * Textually identical to `growthAt` in src/shaders/compute/water-quality.frag. Each side applies it to its own
 * channels - the soil spends the carbon lying on it, the film spends what is in it - so this is a conversion
 * rather than a transfer and the two copies never have to read the same texel to agree. Keep them in step by
 * hand, and keep `growthFor` in tests/waterQualityReferenceModel.ts in step with them.
 *
 * Two terms, both paid out of `organic`: `organicConversionRate` seeds a population where there was none (organic
 * matter arrives carrying it), and `growthGain` lets an established one work through its food faster. Neither runs
 * on a dry bed: nothing multiplies in air, which is what lets a pat sit there until rain comes.
 */
float growthAt(float organic, float population, float wetness) {
    float available = max(organic, 0.0);

    // Clamped before it is applied, so the conversion cannot outpace one pass's budget and cannot take more than
    // the cell holds: rate <= GROWTH_CEILING and the result is a fraction of `available`.
    float rate =
        min((organicConversionRate + growthGain * max(population, 0.0)) * dtScale, GROWTH_CEILING);

    return available * rate * wetness;
}

/**
 * Organic matter an animal drops on this texel this pass.
 *
 * The same soft-edged disc water-sources.frag and water-quality.frag's emissionAt use, over the same world-space
 * mapping, so a deposit declared in the coordinates a grazing animal stands in lands where it stands. Deposits fill
 * only the organic channel: animals do not contaminate the ground with bacteria here, and they certainly do not add
 * oxygen to it.
 */
float depositAt(vec2 worldPos) {
    float deposited = 0.0;

    for (int i = 0; i < 8; i++) {
        if (i >= uDepositCount) {
            break;
        }

        vec4 deposit = uDepositPoints[i];
        vec2 delta = worldPos - deposit.xy;
        float distanceSq = dot(delta, delta);
        float radiusSq = deposit.z * deposit.z;
        if (distanceSq >= radiusSq) {
            continue;
        }

        float falloff = 1.0 - distanceSq / radiusSq;
        deposited += deposit.w * falloff * falloff * (3.0 - 2.0 * falloff) * dtScale;
    }

    return deposited;
}

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // R is bacterial content bound to the ground and G is organic matter on it: mass per unit area in the same units
    // as the water column's channels, so the two compartments of one species can be added and compared without a
    // rescaling. B and A are unused and stay zero - append future terrain compartments rather than renumbering these
    // two, since texels are saved data as soon as save/load learns about this variable (and it has).
    float soilBacteria = texture2D(terrainQuality, uv).r;
    float soilOrganic = texture2D(terrainQuality, uv).g;

    float toTerrainBacteria;
    float toWaterBacteria;
    float toWaterOrganic;
    exchangeAt(uv, toTerrainBacteria, toWaterBacteria, toWaterOrganic);

    // Growth is read off the committed soil, exactly like the two exchange legs above - nothing an animal dropped
    // this pass can feed the population in the same pass it landed (plan A3) - and it converts the soil's own
    // organic into its own bacteria, so no cross-shader agreement is needed for the arithmetic to balance.
    float wetness = clamp(texture2D(waterHeight, uv).r / WET_DEPTH, 0.0, 1.0);
    float converted = growthAt(soilOrganic, soilBacteria, wetness);

    // Neither compartment flows: it is in the ground, so advection belongs to the water column and erosion belongs
    // to sediment-flow.frag (which currently moves mineral grains, not either of these - see README). Bacteria reach
    // this side from the film above it - and only where this cell's own organic matter is around to catch them.
    float bacteriaDecay = clamp(soilDecayRate * dtScale, 0.0, DECAY_CEILING);

    // Mineralisation: the pat weathering away where it fell rather than running off. Deliberately slower than the
    // water column's fade so a grazed field stays visible for minutes of rain, and capped like every other per-pass
    // coefficient so a long frame cannot erase a season in one step (plan S6). Both this and toWaterOrganic read the
    // same committed soilOrganic, and with the conversion below their ceilings add up to 0.65, so the channel cannot
    // go negative - which is why there is no trailing max() here any more than water-quality.frag wants one.
    float organicLoss = clamp(organicDecayRate * dtScale, 0.0, DECAY_CEILING);

    // Deposits land last, after decay, exchange and growth, so what an animal dropped this pass cannot be washed
    // away or eaten by the same pass - the one-step lag sediment-flow.frag uses for eroded material (plan A3).
    // Alpha zero rather than the conventional one: this texture is a data field that is only ever sampled by hand.
    vec2 worldPos = vec2(uv.x * uTerrainSize, (1.0 - uv.y) * uTerrainSize);

    gl_FragColor = vec4(
        soilBacteria * (1.0 - bacteriaDecay) + toTerrainBacteria - toWaterBacteria + converted,
        soilOrganic * (1.0 - organicLoss) - toWaterOrganic - converted + depositAt(worldPos),
        0.0,
        0.0
    );
}
