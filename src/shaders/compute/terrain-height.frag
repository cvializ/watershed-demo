// Terrain height update based on sediment erosion/deposition.
//
// GPUComputationRenderer auto-injects uniforms:
// - heightMap: current terrain height (self-dependency)
// - sedimentFlow: erosion/deposition data from sediment simulation
//
// Reads the sediment flow texture to accumulate terrain changes:
// - R,G = sediment flow direction (unused for height)
// - B   = sediment amount / transport capacity
// - A   = erosion (+) or deposition (-) rate
//
// Physics model:
// - Positive A (erosion): terrain height decreases as sediment is carried away
// - Negative A (deposition): terrain height increases as sediment settles
// - Changes accumulate over time for gradual geological effect

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Read current terrain height
    float currentHeight = texture2D(heightMap, uv).r;

    // Read sediment erosion/deposition rate from alpha channel
    vec4 sedimentData = texture2D(sedimentFlow, uv);
    float erosionDepositionRate = sedimentData.a;

    // Scale the effect for visible but gradual changes
    // Erosion (positive rate) lowers terrain, deposition (negative rate) raises it
    float heightChange = -erosionDepositionRate * 0.1;

    // Accumulate the change
    float newHeight = currentHeight + heightChange;

    // Store as RGBA (GPUComputationRenderer expects RGBA)
    gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
}