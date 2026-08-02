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

    // Divergence: positive means flow is spreading out (deposition zone)
    // negative means flow is converging (erosion zone)
    float divergence = 0.25 * (velE + velW + velN + velS) - velocityMagnitude;

    // Erosion/deposition rate
    // Negative divergence (convergence) with high velocity = erosion
    // Positive divergence (spreading) = deposition
    float erosionDeposition;
    if (divergence < 0.0) {
        // Converging flow erodes sediment from terrain
        erosionDeposition = -divergence * transportCapacity * 2.0;
    } else {
        // Diverging flow deposits carried sediment
        erosionDeposition = -divergence * transportCapacity;
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

    // Smooth the sediment amount to avoid extreme spikes
    newSedimentAmount = mix(prevSediment.b, newSedimentAmount, 0.3);

    // Store: R,G = flow direction, B = amount, A = erosion/deposition rate
    gl_FragColor = vec4(
        sedimentDirection.x,
        sedimentDirection.y,
        newSedimentAmount,
        erosionDeposition
    );
}