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

    // Calculate sediment transport based on velocity
    // Higher velocity = more sediment can be carried
    float sedimentTransport = min(velocityMagnitude * uSedimentCapacity, 1.0);

    // Determine erosion vs deposition
    // High velocity = erosion (sediment is carried away)
    // Low velocity = deposition (sediment is dropped)
    
    float erosionAmount = 0.0;
    float depositionAmount = 0.0;

    if (sedimentTransport > 0.1) {
        // Erosion phase: water picks up sediment from current terrain
        float availableErosion = prevErodedHeight * uErosionRate;
        erosionAmount = sedimentTransport * availableErosion;
        
        // Limit erosion to prevent negative heights
        erosionAmount = min(erosionAmount, prevErodedHeight * 0.5);
    } else {
        // Deposition phase: water slows down and drops sediment
        depositionAmount = sedimentTransport * uDepositionRate;
    }

    // Apply erosion and deposition to previous eroded height (accumulation)
    float newHeight = prevErodedHeight - erosionAmount + depositionAmount;

    // Clamp to prevent extreme values (but allow some depression)
    newHeight = max(0.0, newHeight);

    gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
}