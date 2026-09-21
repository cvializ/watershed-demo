#include <common>

// Dependency samplers waterHeight / waterQuality / terrainQuality are injected by GPUComputationRenderer from
// this variable's declared dependencies, so re-declaring them here would be a compile error (src/gpu/README.md,
// section 1). Only the custom uniforms below belong to this shader.

uniform float dtScale; // Frame-rate coupling, same convention and clamps as water-quality.frag (plan S6)
uniform float soilDecayRate; // Die-off of the ground population, first order like the water column's fade
uniform float soilAttachRate; // Shares its value with water-quality.frag via SUBSTANCE_EXCHANGE_RATES
uniform float washOffRate; // ...and so does this one, which is what balances the ledger

// A film at least this deep counts as standing water. Same threshold water-visualization.frag uses to decide
// whether a cell reads as wet, and the same one water-quality.frag applies to dissolved oxygen, so "there is
// water here" means one thing across the simulation rather than three.
const float WET_DEPTH = 0.01;

// Most either direction may hand over in a single pass. The ceiling is arithmetic rather than taste: a wet cell
// can be exporting FLUX_CEILING (0.75) of its bacteria to a downslope neighbour at the same time and is itself
// faded by up to DECAY_CEILING (0.25), so the ground may take at most (1 - 0.75) * (1 - 0.25) = 0.1875 of the
// committed population before the water column would go negative. 0.15 sits inside that with room to spare.
const float EXCHANGE_CEILING = 0.15;
const float DECAY_CEILING = 0.25;

/**
 * The bacterial hand-over between this cell's water film and its ground, as the two sides of one ledger.
 *
 * Textually identical to `exchangeAt` in src/shaders/compute/water-quality.frag: both shaders evaluate it on the
 * same committed texel (GPUComputationRenderer binds every dependency to the last committed frame of a pass), so
 * what leaves one compartment arrives in the other and neither side needs a renormalisation. Same trick as
 * sediment-flow.frag's outfluxAt, and for the same reason - transport authority stays with one owner and mass
 * moves rather than being minted (plan A4). Keep the two copies in step by hand; GLSL cannot import.
 */
void exchangeAt(vec2 uv, out float toTerrain, out float toWater) {
    float depth = texture2D(waterHeight, uv).r;

    // Nothing trades across a dry bed: no film to carry bacteria down, and none to pick them up again. The
    // ground population simply waits there - which is the whole point of treating bacterial content as a property
    // of the terrain as well as of the water.
    float wetness = clamp(depth / WET_DEPTH, 0.0, 1.0);

    float attach = min(soilAttachRate * dtScale, EXCHANGE_CEILING) * wetness;
    float washOff = min(washOffRate * dtScale, EXCHANGE_CEILING) * wetness;

    toTerrain = max(texture2D(waterQuality, uv).a, 0.0) * attach;
    toWater = max(texture2D(terrainQuality, uv).r, 0.0) * washOff;
}

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // R is bacterial content bound to the ground: mass per unit area in the same units as the water column's
    // channels, so the two compartments of one species can be added and compared without a rescaling. G, B and A
    // are unused and stay zero - append future terrain compartments rather than renumbering this one, since
    // texels are saved data as soon as save/load learns about this variable.
    float soilMass = texture2D(terrainQuality, uv).r;

    float toTerrain;
    float toWater;
    exchangeAt(uv, toTerrain, toWater);

    // This compartment does not flow: it is in the ground, so advection belongs to the water column and erosion
    // belongs to sediment-flow.frag (which currently moves mineral grains, not this bacteria - see README).
    float decay = clamp(soilDecayRate * dtScale, 0.0, DECAY_CEILING);

    // Alpha zero rather than the conventional one: this texture is a data field that is only ever sampled by hand,
    // so an unused channel stays empty instead of pretending to be an opaque colour map.
    gl_FragColor = vec4(soilMass * (1.0 - decay) + toTerrain - toWater, 0.0, 0.0, 0.0);
}
