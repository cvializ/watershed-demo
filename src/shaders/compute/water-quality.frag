#include <common>

// Dependency samplers waterVelocity / waterHeight / waterQuality / terrainQuality are injected by
// GPUComputationRenderer from this variable's declared dependencies, so re-declaring them here would be a compile
// error. The last of those is the ground's share of the two species that live in the soil as well as the water - its
// bacterial content in R and its organic matter in G, the second of which is what conditions the bacterial deposit -
// and its edge is added by linkWaterQualityToTerrain once both Variables exist. Only the custom uniforms below
// belong to this shader (src/gpu/README.md, section 1).

uniform float uTerrainSize; // World size of the terrain: how source points map to texels, as in water-sources.frag
uniform float fluxFraction; // Fraction of a cell's content one pass exports; mirrors water-height.frag's flux law
uniform float dtScale; // Frame-rate coupling, same convention and clamps as sediment-flow.frag (plan S6)
uniform float decayRate; // First-order fade, so an emitter cannot slowly fill the whole catchment
uniform float soilDepositRate; // Ground exchange: shares its value with terrain-quality.frag via SUBSTANCE_EXCHANGE_RATES
uniform float organicDepositThreshold; // ...and this is what conditions it: soil organic that saturates that deposit
uniform float washOffRate;    // ...and so does this one, which is what balances the ledger between compartments
uniform float organicWashOffRate; // ...and this third, the ground's organic matter running off into this film
uniform float organicConversionRate; // Growth, not exchange: shares its value with terrain-quality.frag via BACTERIA_GROWTH
uniform float growthGain; // ...and this is the extra fraction an already-established colony converts with
uniform int uInjectCount;
uniform vec4 uInjectPoints[8]; // (x, y, radius, amount) in world units; amount is mass per pass at 60 fps
uniform float uInjectSpecies[8]; // Channel fed: 0 nitrogen, 1 organic matter, 2 oxygen, 3 bacteria

// The canonical D8 table water-velocity.frag emits its direction from and sediment-flow.frag snaps back to.
// Substance reuses that announcement instead of running a third downslope search: the route the water took and
// the route the substance takes therefore cannot disagree, which is what keeps a plume on the flow paths even
// though this shader never looks at terrain at all.
const vec2 DIRECTION_STEPS[8] = vec2[](
    vec2(0.0, 1.0), // North
    vec2(1.0, 1.0), // Northeast
    vec2(1.0, 0.0), // East
    vec2(1.0, -1.0), // Southeast
    vec2(0.0, -1.0), // South
    vec2(-1.0, -1.0), // Southwest
    vec2(-1.0, 0.0), // West
    vec2(-1.0, 1.0) // Northwest
);

const float EPS = 1e-7;
const float FLUX_CEILING = 0.75; // advective CFL analogue: at most this fraction of a cell leaves in one pass
const float DECAY_CEILING = 0.25; // keeps decay * dtScale inside its own budget, never unbounded

// A film at least this deep counts as standing water: the same threshold water-visualization.frag uses to decide
// whether a cell reads as wet, so dissolved oxygen's "there is no water here for it to be in" and the visualiser's
// "there is water here" are one rule rather than two that can drift apart.
const float WET_DEPTH = 0.01;

// Most bacteria either direction of an exchange may hand over in a single pass, and most the ground compartment
// can take: this cell may simultaneously be exporting FLUX_CEILING (0.75) of its committed bacteria downslope and
// be faded by DECAY_CEILING (0.25), which leaves 0.1875 available - so anything above that would let the water
// column go negative. terrain-quality.frag carries the same ceiling; see below for why it has to.
const float EXCHANGE_CEILING = 0.15;

// Most of a cell's organic matter either compartment may convert into bacteria in one pass. Same reasoning as the
// ceilings above, and the same value on both sides so a scenario that runs the growth law at its ceiling gets the
// same answer from the film and from the ground. See BACTERIA_GROWTH in
// src/gpu/waterFlowSimulation/variables/substanceExchange.ts.
const float GROWTH_CEILING = 0.25;

bool insideGrid(vec2 uv) {
    return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

/**
 * Substance leaving the texel at `p` this pass, as a fraction of what that texel holds right now, plus the
 * canonical step it leaves along (`routeStep` comes back zero when nothing can leave).
 *
 * This is a pure function of `p` and of committed textures, so an importer re-evaluating it on the exporter's
 * texel gets bit-for-bit the number the exporter subtracted: mass moves rather than appearing, exactly as in
 * sediment-flow.frag's outfluxAt (plan A4), and nothing downstream needs a renormalisation.
 */
float exportFractionAt(vec2 p, vec2 cellSize, out vec2 routeStep) {
    routeStep = vec2(0.0);

    // water-velocity.frag's layout: unit downslope direction * speed, zero where the cell is dry or still.
    vec2 velocity = texture2D(waterVelocity, p).rg;
    if (length(velocity) < EPS) {
        return 0.0;
    }

    // Snap to the table entry this velocity was emitted from, keeping the step itself rather than an index:
    // GLSL ES 1.00 restricts array indexing to constant and loop-index expressions, and the importing side has
    // to be able to compare the route without re-running this search.
    vec2 bestStep = vec2(0.0);
    float bestAlignment = -1.0;
    for (int i = 0; i < 8; i++) {
        vec2 candidateStep = DIRECTION_STEPS[i];
        float alignment = dot(velocity, candidateStep / max(length(candidateStep), EPS));
        if (alignment > bestAlignment) {
            bestAlignment = alignment;
            bestStep = candidateStep;
        }
    }

    // Border retention: a cell that would export off-grid keeps its substance, so no neighbour ever imports
    // from beyond the edge either. Same rule as sediment-flow.frag's silent-leak refusal.
    if (!insideGrid(p + bestStep * cellSize)) {
        return 0.0;
    }

    routeStep = bestStep;
    return clamp(fluxFraction * dtScale, 0.0, FLUX_CEILING);
}

/**
 * The hand-over between this cell's water film and its ground, as the sides of one ledger.
 *
 * Textually identical to `exchangeAt` in src/shaders/compute/terrain-quality.frag: both shaders evaluate it on
 * the same committed texel (GPUComputationRenderer binds every dependency to the last committed frame of a pass),
 * so what leaves one compartment arrives in the other, exactly as sediment-flow.frag's outfluxAt makes erosion and
 * deposition agree without either side minting mass (plan A4). Keep the two copies in step by hand; GLSL cannot import.
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
 * Textually identical to `growthAt` in src/shaders/compute/terrain-quality.frag, which applies it to the ground's
 * own two channels: this is not a transfer across the boundary, so the two copies never need to read the same
 * texel - each side spends only the carbon it is holding, and organic plus bacteria in a cell only change by what
 * decay takes. Keep the two copies in step by hand; GLSL cannot import - and keep
 * `growthFor` in tests/waterQualityReferenceModel.ts in step with them, since that is what the parity tests
 * compare against.
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
 * Mass a source drops on this texel this pass, already split across the four channels.
 *
 * The channel arrives as a float from a uniform array, and GLSL ES 1.00 cannot index a vec4 at runtime, so the
 * species becomes a 0/1 mask built by step() - one comparison per channel instead of a branch per source.
 */
vec4 emissionAt(vec2 worldPos) {
    vec4 emitted = vec4(0.0);

    for (int i = 0; i < 8; i++) {
        if (i >= uInjectCount) {
            break;
        }

        vec4 source = uInjectPoints[i];
        float channel = uInjectSpecies[i];

        vec2 delta = worldPos - source.xy;
        float distanceSq = dot(delta, delta);
        float radiusSq = source.z * source.z;
        if (distanceSq >= radiusSq) {
            continue;
        }

        // Same soft-edged disc water-sources.frag uses: 1 at the centre, 0 at the rim.
        float falloff = 1.0 - distanceSq / radiusSq;
        vec4 channelMask = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - vec4(channel)), vec4(0.5));
        emitted += channelMask * (source.w * falloff * falloff * (3.0 - 2.0 * falloff) * dtScale);
    }

    return emitted;
}

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Channels are load-bearing, not colours: R nitrogen, G organic matter, B dissolved oxygen, A bacteria.
    // Each one is column-integrated mass (concentration times depth) rather than concentration, which is what
    // makes water-height.frag's drainage harmless for the ones that can dry out: the water leaves and the
    // substance stays behind, so a puddle concentrates instead of quietly deleting what was dissolved in it.
    //
    // Two channels are treated differently below, because they are not properties of the ground:
    // - B dissolved oxygen belongs to the water alone. It cannot be banked in dry soil, so it thins out with the
    //   film it was dissolved in and an emitter aimed at dry ground releases nothing.
    // - A bacteria belongs to both compartments: what is here flows with the water, and what settles out of it does
    //   so only over ground with organic matter in it, which is then held until the next flood washes some back.
    // - G organic matter belongs to both compartments too, but it only ever arrives in this column from above: animals
    //   drop it on the ground and a film picks some of that up. Nothing settles out of a stream and becomes manure in
    //   the soil, so this shader is a receiver for organic matter and never a donor.
    vec4 ownMass = texture2D(waterQuality, uv);
    float depth = texture2D(waterHeight, uv).r;
    float wetness = clamp(depth / WET_DEPTH, 0.0, 1.0);

    // Own export first. fluxFraction <= FLUX_CEILING < 1 keeps this non-negative structurally, so no trailing
    // max() is needed - and none wanted: a clamp here would hide a broken fraction instead of reporting it.
    vec2 ownRouteStep;
    float ownFraction = exportFractionAt(uv, cellSize, ownRouteStep);
    vec4 kept = ownMass * (1.0 - ownFraction);

    // Conservative gather: a neighbour contributes exactly when it routes back here, re-evaluated on ITS texel
    // read rather than guessed at from this one, so the grid sum of (influx - loss) is zero by construction.
    vec4 influx = vec4(0.0);
    for (int i = 0; i < 8; i++) {
        vec2 neighborUV = uv + DIRECTION_STEPS[i] * cellSize;
        if (!insideGrid(neighborUV)) {
            continue;
        }

        vec2 neighborRouteStep;
        float neighborFraction = exportFractionAt(neighborUV, cellSize, neighborRouteStep);
        if (neighborFraction <= 0.0) {
            continue;
        }

        // Negation of a table entry: both sides are copies of the same literals rather than arithmetic on
        // directions, so exact component equality is the right test for "it flows into me".
        if (all(equal(neighborRouteStep, -DIRECTION_STEPS[i]))) {
            influx += texture2D(waterQuality, neighborUV) * neighborFraction;
        }
    }

    vec4 faded = (kept + influx) * (1.0 - clamp(decayRate * dtScale, 0.0, DECAY_CEILING));

    // Dissolved oxygen is a property of the water, not of the ground under it: as the film thins towards WET_DEPTH
    // the oxygen leaves with the water that left (outgassing and respiration both take their dose out of a
    // shrinking film), and where there is no film at all there is none to keep. Nitrogen, organic matter and
    // bacteria deliberately keep their dry deposits - a drained puddle's residue is part of the story.
    //
    // wetness is this pass's survival fraction, so dtScale belongs in the exponent rather than as a multiplier:
    // surviving two frames at 0.7 each is 0.49, which is what pow gives (plan S6 - a per-pass coefficient that is
    // not frame-rate coupled just means the substance drains faster on a fast machine). The dry case is spelled out
    // because GLSL's pow is undefined at base zero with a fractional exponent, and a dry cell reaches exactly zero.
    faded.b *= wetness <= 0.0 ? 0.0 : pow(wetness, dtScale);

    // The ground exchange is applied on the committed population (ownMass.a and terrainQuality.rg inside exchangeAt),
    // which is what lets terrain-quality.frag move precisely these amounts without seeing transport or decay: its side
    // of the ledger reads the same committed texel, so each species moves between compartments and nowhere else.
    float toTerrainBacteria;
    float toWaterBacteria;
    float toWaterOrganic;
    exchangeAt(uv, toTerrainBacteria, toWaterBacteria, toWaterOrganic);

    // Growth, on the other hand, is read off the amount this cell actually has left after transport and fade - it
    // is a conversion within the compartment rather than a transfer across the boundary, so there is no other side
    // to agree with, and taking it from the post-transport amount is what guarantees the organic cannot go negative.
    float converted = growthAt(faded.g, faded.a, wetness);
    faded.a += toWaterBacteria - toTerrainBacteria + converted;

    // The organic leg runs one way only, which is why this reads as an addition rather than as a difference: the
    // ground's manure comes from animals and leaves with water, and never the other way round. `converted` then
    // comes straight out of the film, so a plume that grows is only spending the carbon it is carrying.
    faded.g += toWaterOrganic - converted;

    // Emission lands after transport, so substance a source adds this pass cannot be exported by the same pass:
    // the one-step lag sediment-flow.frag uses for eroded material (plan A3). Sources are persistent emitters -
    // createGpuWaterQuality keeps them until clearPollutantSources(), unlike water sources, which are consumed.
    vec2 worldPos = vec2(uv.x * uTerrainSize, (1.0 - uv.y) * uTerrainSize);

    vec4 emitted = emissionAt(worldPos);

    // An oxygen source on dry ground adds nothing: the channel belongs to the water column, and enforcing that
    // here means the visualiser never has to decide where dissolved oxygen is allowed to read.
    emitted.b *= wetness;

    gl_FragColor = vec4(faded + emitted);
}
