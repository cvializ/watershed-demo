precision highp float;

uniform sampler2D uHeightMap;
uniform vec3 uWireColor;
uniform float uLineWidth;

varying vec2 vUv;
varying vec3 vBarycentric;

vec3 getColorPalette(float normalizedHeight) {
    float h = clamp(normalizedHeight, 0.0, 1.0);
    vec3 colorLow = vec3(0.1, 0.4, 0.8);
    vec3 colorHigh = vec3(0.6, 0.6, 0.6);
    return mix(colorLow, colorHigh, h);
}

void main() {
    // Sample height for base color
    float h = texture2D(uHeightMap, vUv).r;
    float normalizedHeight = (h + 1.5) / 3.5;
    vec3 baseColor = getColorPalette(normalizedHeight);

    // Barycentric coordinates: distance to each edge (0 at edge, 1 at opposite vertex)
    vec3 bary = vBarycentric;

    // Distance to the nearest edge
    float minDist = min(bary.x, min(bary.y, bary.z));

    // Smooth edge detection - draw lines where barycentric coords are near zero
    // Scale linewidth relative to terrain size (12 units, 80 segments)
    float edgeThreshold = uLineWidth / 800.0;
    float line = 1.0 - smoothstep(0.0, edgeThreshold, minDist);

    // Mix wireframe color over base terrain color
    vec3 finalColor = mix(baseColor, uWireColor, line);

    gl_FragColor = vec4(finalColor, 1.0);
}