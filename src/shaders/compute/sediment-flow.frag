#include <common>

// Dependency samplers are injected by GPUComputationRenderer, one per declared dependency and
// named after the *dependency variable* (waterVelocity / waterHeight / heightMap / sedimentFlow).
// Re-declaring any of those names here would be a compile error (plan section 2), so only custom
// textures are declared below.

uniform sampler2D uBaseHeightMap; // Static base displacement -> immovable bedrock proxy (A2)
uniform sampler2D surfaceMaterialMap; // Surface material id per cell (A9)

// Parameters (S6). All coefficients stay per-frame, scaled by dtScale.
uniform float erosionCoefficient; // driven by world.erosionRate
uniform float capacityExponent;
uniform float criticalSpeed;
uniform float detachRate;
uniform float settleRate;
uniform float transferCap; // <= 1: advective CFL analogue + mass safety knob
uniform float erodibleDepth; // bedrock = uBaseHeightMap.r - erodibleDepth (A2)
uniform float dtScale;

void main() {
    // Scaffolding only for now (plan A17 step 1): transport and the paired erosion/deposition
    // exchange arrive in later steps, at which point this writes
    // vec4(direction.xy, suspendedLoad, signedBedDelta).
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
}
