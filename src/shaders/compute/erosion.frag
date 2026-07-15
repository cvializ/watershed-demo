#include <common>

uniform sampler2D uInitialHeightMap;
uniform sampler2D uVelocityMap;
uniform float uErosionRate;
uniform float uDepositionRate;
uniform float uSedimentCapacity;

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Get initial terrain height (never changes) - base reference
    float initialHeight = texture2D(uInitialHeightMap, uv).r;

    // Get previous frame's eroded height (accumulated changes)
    float prevErodedHeight = texture2D(erosion, uv).r;

    // Get velocity information from water simulation
    vec4 velocityData = texture2D(uVelocityMap, uv);
    vec2 velocity = velocityData.xy;
    float velocityMagnitude = length(velocity);

    // If there's no water flow, no change occurs (keep cumulative height)
    if (velocityMagnitude < 0.001) {
        gl_FragColor = vec4(prevErodedHeight, 0.0, 0.0, 1.0);
        return;
    }

    // Calculate sediment transport capacity based on velocity
    float transportCapacity = min(velocityMagnitude * uSedimentCapacity, 1.0);

    // Smooth transition using smoothstep for gradual changes
    float transition = smoothstep(0.0, 0.3, transportCapacity);

    // Erosion amount - proportional to sediment transport capacity
    float availableMaterial = min(prevErodedHeight * 0.5, 0.2);
    float erosionAmount = transportCapacity * availableMaterial * uErosionRate;

    // Deposition - when velocity drops, sediment is dropped
    float depositionAmount = (1.0 - transition) * transportCapacity * uDepositionRate;

    // Apply changes with clamping
    float newHeight = prevErodedHeight - erosionAmount + depositionAmount;
    newHeight = max(0.0, min(newHeight, initialHeight + 1.0));

    // Apply simple Laplacian smoothing to ensure continuous features
    // This helps prevent disjoint erosion and creates smoother terrain
    float totalNeighborHeight = 0.0;
    int neighborCount = 0;
    
    // Sample the 4 cardinal neighbors (N, S, E, W)
    float neighborHeights[4];
    
    // North
    vec2 northUV = uv + vec2(0.0, cellSize.y);
    if (northUV.y <= 1.0) {
        neighborHeights[0] = texture2D(erosion, northUV).r;
        neighborCount++;
    }
    
    // South
    vec2 southUV = uv + vec2(0.0, -cellSize.y);
    if (southUV.y >= 0.0) {
        neighborHeights[1] = texture2D(erosion, southUV).r;
        neighborCount++;
    }
    
    // East
    vec2 eastUV = uv + vec2(cellSize.x, 0.0);
    if (eastUV.x <= 1.0) {
        neighborHeights[2] = texture2D(erosion, eastUV).r;
        neighborCount++;
    }
    
    // West
    vec2 westUV = uv + vec2(-cellSize.x, 0.0);
    if (westUV.x >= 0.0) {
        neighborHeights[3] = texture2D(erosion, westUV).r;
        neighborCount++;
    }
    
    // Apply smoothing: blend with neighbors to reduce jagged edges
    if (neighborCount > 0) {
        float neighborAvg = (neighborHeights[0] + neighborHeights[1] + 
                            neighborHeights[2] + neighborHeights[3]) / float(neighborCount);
        // Blend with neighbors (0.25 = gentle smoothing)
        newHeight = mix(newHeight, neighborAvg, 0.25);
    }

    gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
}