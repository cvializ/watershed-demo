uniform sampler2D uTestingTexture;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    // Sample the sediment flow texture
    // R,G = sediment flow direction (2D vector)
    // B   = sediment amount / transport capacity
    // A   = erosion (+) or deposition (-) rate
    vec4 sedimentData = texture2D(uTestingTexture, vUv);

    vec2 direction = sedimentData.rg;
    float amount = sedimentData.b;
    float erosionRate = sedimentData.a;

    // Visualize sediment flow:
    // - Base color from sediment amount (warm tones: brown to orange)
    // - Direction encoded as a subtle tint
    // - Erosion shown in red, deposition in blue

    // Sediment amount visualization: dark brown -> bright orange
    vec3 sedimentColor = mix(
        vec3(0.1, 0.05, 0.0),   // Dark brown (no sediment)
        vec3(1.0, 0.6, 0.2),    // Bright orange (high sediment)
        clamp(amount, 0.0, 1.0)
    );

    // Erosion/deposition overlay:
    // Positive erosionRate = erosion (red tint)
    // Negative erosionRate = deposition (blue tint)
    vec3 erosionOverlay;
    if (erosionRate > 0.0) {
        // Erosion: red tint
        erosionOverlay = mix(vec3(0.0), vec3(1.0, 0.2, 0.0), clamp(erosionRate * 5.0, 0.0, 1.0));
    } else {
        // Deposition: blue tint
        erosionOverlay = mix(vec3(0.0), vec3(0.0, 0.2, 1.0), clamp(-erosionRate * 5.0, 0.0, 1.0));
    }

    // Direction indicator: subtle brightness based on flow direction angle
    float directionAngle = atan(direction.y, direction.x);
    float directionBrightness = 0.5 + 0.1 * sin(directionAngle * 2.0);

    // Combine all components
    vec3 finalColor = sedimentColor * directionBrightness + erosionOverlay;

    // Ensure no-flow areas are dark
    float flowStrength = length(direction);
    finalColor *= max(flowStrength, 0.1);

    gl_FragColor = vec4(finalColor, 1.0);
}