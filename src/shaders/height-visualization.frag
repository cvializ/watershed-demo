precision highp float;

uniform sampler2D uHeightMap;
uniform float uMinHeight;
uniform float uMaxHeight;

varying vec2 vUv;

vec3 getColorPalette(float normalizedHeight) {
    float h = clamp(normalizedHeight, 0.0, 1.0);

    // Two-color scheme: low elevations in blue, high elevations in gray
    vec3 colorLow = vec3(0.1, 0.4, 0.8);   // Blue for low elevations
    vec3 colorHigh = vec3(0.6, 0.6, 0.6);  // Gray for high elevations

    return mix(colorLow, colorHigh, h);
}

void main() {
    // Sample height from texture instead of computing noise
    float h = texture2D(uHeightMap, vUv).r;

    // Normalize height
    float normalizedHeight = (h - uMinHeight) / (uMaxHeight - uMinHeight);

    // Get color from palette
    vec3 color = getColorPalette(normalizedHeight);

    gl_FragColor = vec4(color, 1.0);
}