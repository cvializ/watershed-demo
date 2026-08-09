#include <common>

uniform sampler2D uVelocityMap;
uniform sampler2D uHeightMap;
uniform sampler2D surfaceMaterialMap; // Surface material texture
uniform float baseErosionRate;

// Uniform to indicate if surface material map is available (1.0 = yes, 0.0 = no)
uniform float uHasSurfaceMaterialMap;

// Material types (must match surfaceMaterial.ts)
const float MATERIAL_BARE_DIRT = 0.0;
const float MATERIAL_GRASS = 1.0;
const float MATERIAL_ROCKS = 2.0;

// Material erosion coefficients (how easily material erodes)
// Higher = easier to erode, lower = more resistant
const float EROSION_RESISTANCE_BARE_DIRT = 1.0; // Baseline erosion rate
const float EROSION_RESISTANCE_GRASS = 0.3; // Grass roots stabilize soil (harder to erode)
const float EROSION_RESISTANCE_ROCKS = 0.1; // Rocks are very resistant to erosion

// Material deposition coefficients (how easily sediment settles)
// Higher = more likely to deposit, lower = sediment stays in motion
const float DEPOSITION_FACTOR_GRASS = 1.5; // Grass slows water, causing more deposition
const float DEPOSITION_FACTOR_BARE_DIRT = 1.0; // Baseline deposition
const float DEPOSITION_FACTOR_ROCKS = 0.8; // Smooth rocks, sediment stays in motion

// Get material erosion resistance based on surface type
float getMaterialErosionResistance(vec2 uv) {
    if (uHasSurfaceMaterialMap < 0.5) {
        return EROSION_RESISTANCE_BARE_DIRT; // Default to bare dirt if no material map
    }
    vec4 materialData = texture2D(surfaceMaterialMap, uv);
    float materialType = materialData.r;
    
    if (materialType < 0.5) {
        return EROSION_RESISTANCE_BARE_DIRT;
    } else if (materialType < 1.5) {
        return EROSION_RESISTANCE_GRASS;
    } else {
        return EROSION_RESISTANCE_ROCKS;
    }
}

// Get material deposition factor based on surface type
float getMaterialDepositionFactor(vec2 uv) {
    if (uHasSurfaceMaterialMap < 0.5) {
        return DEPOSITION_FACTOR_BARE_DIRT; // Default to bare dirt if no material map
    }
    vec4 materialData = texture2D(surfaceMaterialMap, uv);
    float materialType = materialData.r;
    
    if (materialType < 0.5) {
        return DEPOSITION_FACTOR_BARE_DIRT;
    } else if (materialType < 1.5) {
        return DEPOSITION_FACTOR_GRASS;
    } else {
        return DEPOSITION_FACTOR_ROCKS;
    }
}

// Sediment flow computation based on water velocity and surface material.
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

    // Get material-specific erosion resistance
    float erosionResistance = getMaterialErosionResistance(uv);
    
    // Transport capacity: proportional to velocity^2 * baseErosionRate * material resistance
    // Materials with lower erosion resistance (like rocks) erode less
    float transportCapacity = velocityMagnitude * velocityMagnitude * baseErosionRate * erosionResistance;

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
        // Get material-specific deposition factor
        float depositionFactor = getMaterialDepositionFactor(uv);
        
        if (divergence < 0.0) {
            // Converging flow erodes sediment from terrain
            // Material resistance reduces erosion rate
            erosionDeposition = -divergence * transportCapacity * 2.0;
        } else {
            // Diverging flow deposits carried sediment
            // Material affects how much sediment is deposited (grass = more deposition)
            erosionDeposition = -divergence * transportCapacity * depositionFactor;
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