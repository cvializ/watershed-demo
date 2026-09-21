#include <common>

// Dependency samplers waterVelocity / waterHeight / waterQuality / terrainQuality are injected by
// GPUComputationRenderer from this variable's declared dependencies, so re-declaring them here would be a compile
// error. The last of those is the ground's share of bacterial content, and its edge is added by
// linkWaterQualityToTerrain once both Variables exist. Only the custom uniforms below belong to this shader
// (src/gpu/README.md, section 1).

uniform float uTerrainSize; // World size of the terrain: how source points map to texels, as in water-sources.frag
uniform float fluxFraction; // Fraction of a cell's content one pass exports; mirrors water-height.frag's flux law
uniform float dtScale; // Frame-rate coupling, same convention and clamps as sediment-flow.frag (plan S6)
uniform float decayRate; // First-order fade, so an emitter cannot slowly fill the whole catchment
uniform float soilAttachRate; // Bacterial exchange: shares its value with terrain-quality.frag via SUBSTANCE_EXCHANGE_RATES
uniform float washOffRate;    // ...and so does this one, which is what balances the ledger between compartments
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
 * The bacterial hand-over between this cell's water film and its ground, as the two sides of one ledger.
 *
 * Textually identical to `exchangeAt` in src/shaders/compute/terrain-quality.frag: both shaders evaluate it on
 * the same committed texel (GPUComputationRenderer binds every dependency to the last committed frame of a pass),
 * so what leaves the water column arrives in the ground and vice versa, exactly as sediment-flow.frag's outfluxAt
 * makes erosion and deposition agree without either side minting mass (plan A4). Keep the two copies in step by
 * hand; GLSL cannot import.
 */
void exchangeAt(vec2 uv, out float toTerrain, out float toWater) {
    float depth = texture2D(waterHeight, uv).r;

    // Nothing trades across a dry bed: no film to carry bacteria down, and none to pick them up again. The ground
    // population simply waits there - which is the whole point of treating bacterial content as a property of the
    // terrain as well as of the water.
    float wetness = clamp(depth / WET_DEPTH, 0.0, 1.0);

    float attach = min(soilAttachRate * dtScale, EXCHANGE_CEILING) * wetness;
    float washOff = min(washOffRate * dtScale, EXCHANGE_CEILING) * wetness;

    toTerrain = max(texture2D(waterQuality, uv).a, 0.0) * attach;
    toWater = max(texture2D(terrainQuality, uv).r, 0.0) * washOff;
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
    // - A bacteria belongs to both compartments: what is here flows with the water, and what settles out of it is
    //   handed to terrain-quality.frag, which holds the ground's share until the next flood washes some back.
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

    // The bacterial exchange is applied on the committed population (ownMass.a inside exchangeAt), which is what
    // lets terrain-quality.frag add precisely this amount without seeing transport or decay: its side of the ledger
    // reads the same committed texel, so total bacteria move between compartments and nowhere else.
    float toTerrain;
    float toWater;
    exchangeAt(uv, toTerrain, toWater);
    faded.a += toWater - toTerrain;

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
