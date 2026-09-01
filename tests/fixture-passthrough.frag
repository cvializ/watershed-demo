// Passthrough fixture shader for GPU tests (plan A14).
//
// This is not a variant of any production shader: it re-emits the texel that its own dependency sampler
// reads, so a seeded value survives every compute() pass and the harness owns the boundary conditions
// instead of inheriting them from the water simulation. The suite drives the real sediment-flow and
// terrain-height shaders; only waterVelocity / waterHeight are faked with this file.
//
// GPUComputationRenderer injects the sampler declaration for each declared dependency under that
// dependency's own name (self-dependency included), which is why the sampler here has to be substituted per
// variable - see addFixtureVariable in test-gpu-sediment-flow.ts.

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;
    gl_FragColor = texture2D(__SAMPLER__, uv);
}
