#include <common>

uniform sampler2D uVelocityMap;
uniform sampler2D uHeightMap;
uniform float erosionRate;

// Sediment flow computation based on water velocity.
//
// Reads the velocity field to determine:
// - R,G = sediment flow direction (2D vector)
// - B   = sediment amount / transport capacity
// - A   = erosion (+) or deposition (-) rate
//
// Physics model:
// - Transport capacity scales with velocity magnitude squared
//   (higher flow = exponentially more sediment carried)
// - Erosion occurs where velocity is increasing along the flow path
// - Deposition occurs where velocity decreases (divergence)

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Read current sediment flow (feedback from previous frame)
    vec4 prevSediment = texture2D(sedimentFlow, uv);

    // Read velocity data: R=Vx, G=Vy, B=magnitude
    vec4 velData = texture2D(uVelocityMap, uv);
    vec2 velocity = vec2(velData.r, velData.g);
    float velocityMagnitude = length(velocity);

    // If no meaningful flow, sediment settles
    if (velocityMagnitude < 0.01) {
        // Sediment slowly dissipates when there's no flow
        float decay = 0.99;
        gl_FragColor = vec4(prevSediment.rgb * decay, 0.0);
        return;
    }

    // Transport capacity: proportional to velocity^2 * erosionRate
    float transportCapacity = velocityMagnitude * velocityMagnitude * erosionRate;

    // Compute divergence to determine erosion vs deposition
    // Sample neighbors in the cardinal directions for velocity magnitude
    float velN = length(texture2D(uVelocityMap, uv + vec2(0.0, cellSize.y)).rg);
    float velS = length(texture2D(uVelocityMap, uv - vec2(0.0, cellSize.y)).rg);
    float velE = length(texture2D(uVelocityMap, uv + vec2(cellSize.x, 0.0)).rg);
    float velW = length(texture2D(uVelocityMap, uv - vec2(cellSize.x, 0.0)).rg);

    // Average neighbor velocity for more stable divergence calculation
    float avgNeighborVel = 0.25 * (velE + velW + velN + velS);
    
    // Divergence: positive means flow is spreading out (deposition zone)
    // negative means flow is converging (erosion zone)
    // Clamped divergence for smoother, more natural results
    float divergence = avgNeighborVel - velocityMagnitude;
    
    // Clamp divergence to prevent extreme values
    divergence = clamp(divergence, -0.5, 0.5);

    // Erosion/deposition rate
    // Declare before conditional assignment
    float erosionDeposition = 0.0;
    
    // Apply threshold to prevent erosion from noise and minor fluctuations
    float erosionThreshold = 0.01;
    
    // Only apply significant erosion/deposition
    if (abs(divergence) > erosionThreshold) {
        if (divergence < 0.0) {
            // Converging flow erodes sediment from terrain
            erosionDeposition = -divergence * transportCapacity * 2.0;
        } else {
            // Diverging flow deposits carried sediment
            erosionDeposition = -divergence * transportCapacity;
        }
    } else {
        // Below threshold - no significant change
        erosionDeposition = 0.0;
    }

    // Advection: sediment moves in the direction of flow
    // Sample upstream to advect sediment with the water
    vec2 advectedUv = uv - velocity * cellSize * 0.5;
    vec4 upstreamSediment = texture2D(sedimentFlow, advectedUv);

    // Compute new sediment flow direction (follows velocity direction)
    vec2 sedimentDirection = normalize(velocity);

    // New sediment amount: advected sediment + local erosion - deposition
    float newSedimentAmount = upstreamSediment.b + max(erosionDeposition, 0.0);
    newSedimentAmount = max(newSedimentAmount, 0.0);

    // Limit sediment amount by transport capacity
    newSedimentAmount = min(newSedimentAmount, transportCapacity * 10.0);

    // Apply smoothing to avoid extreme spikes and jagged patterns
    // Use a simple Gaussian-style blur on the sediment amount
    float sum = prevSediment.b;
    int kernelSize = 1; // 3x3 kernel
    for (int dx = -kernelSize; dx <= kernelSize; dx++) {
        for (int dy = -kernelSize; dy <= kernelSize; dy++) {
            if (dx == 0 && dy == 0) continue;
            vec2 offset = vec2(float(dx), float(dy)) * cellSize;
            sum += texture2D(sedimentFlow, uv + offset).b;
        }
    }
    float smoothedAmount = sum / 9.0; // Average of 3x3 neighborhood
    
    // Blend smoothed with original for stability
    newSedimentAmount = mix(newSedimentAmount, smoothedAmount, 0.6);

    // Smooth the erosion/deposition rate as well
    float sumErosion = erosionDeposition;
    for (int dx = -kernelSize; dx <= kernelSize; dx++) {
        for (int dy = -kernelSize; dy <= kernelSize; dy++) {
            if (dx == 0 && dy == 0) continue;
            vec2 offset = vec2(float(dx), float(dy)) * cellSize;
            sumErosion += texture2D(sedimentFlow, uv + offset).a;
        }
    }
    float smoothedErosion = sumErosion / 9.0;
    erosionDeposition = mix(erosionDeposition, smoothedErosion, 0.5);

    // Store: R,G = flow direction, B = amount, A = erosion/deposition rate
    gl_FragColor = vec4(
        sedimentDirection.x,
        sedimentDirection.y,
        newSedimentAmount,
        erosionDeposition
    );
}