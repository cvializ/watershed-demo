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
    // Reduced multiplier for smoother, more natural slopes
    float heightChange = -erosionDepositionRate * 0.02;

    // Accumulate the change
    float newHeight = currentHeight + heightChange;

    // Apply additional smoothing to prevent jagged artifacts
    // Sample neighboring heights and blend for smooth transitions
    float neighborSum = 0.0;
    int kernelSize = 1; // 3x3 kernel
    for (int dx = -kernelSize; dx <= kernelSize; dx++) {
        for (int dy = -kernelSize; dy <= kernelSize; dy++) {
            if (dx == 0 && dy == 0) continue;
            vec2 offset = vec2(float(dx), float(dy)) * cellSize;
            neighborSum += texture2D(heightMap, uv + offset).r;
        }
    }
    float neighborAvg = neighborSum / 8.0;
    
    // Blend new height with average of neighbors (Laplacian smoothing)
    float smoothedHeight = mix(newHeight, neighborAvg, 0.3);

    // Store as RGBA (GPUComputationRenderer expects RGBA)
    gl_FragColor = vec4(smoothedHeight, 0.0, 0.0, 1.0);
}