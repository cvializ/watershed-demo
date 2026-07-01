precision highp float;

uniform sampler2D uDisplacementMap;
uniform float uDisplacementScale;
uniform float uDisplacementBias;

varying vec3 vNormal;
varying vec2 vUv;

void main() {
    // Calculate lighting
    float ambient = 0.3;
    vec3 lightDirection = normalize(vec3(1.0, 2.0, 1.0));
    float diff = max(dot(vNormal, lightDirection), 0.0);
    
    // Base color from height in texture (for visual reference)
    float displacement = texture2D(uDisplacementMap, vUv).r;
    
    // Color palette based on height
    vec3 colorLow = vec3(0.1, 0.4, 0.8);   // Blue for low elevations (river valleys)
    vec3 colorMid = vec3(0.2, 0.7, 0.2);   // Green for mid elevations
    vec3 colorHigh = vec3(0.8, 0.8, 0.8);  // White for high elevations (mountains)
    
    // Create a more natural terrain color gradient
    vec3 baseColor;
    if (displacement < 0.2) {
        // River valley - blues and browns
        baseColor = mix(colorLow, vec3(0.4, 0.3, 0.2), clamp((displacement + 1.5) / 0.4, 0.0, 1.0));
    } else if (displacement < 0.8) {
        // Mid elevations - greens
        baseColor = mix(colorLow, colorMid, clamp((displacement - 0.2) / 0.6, 0.0, 1.0));
    } else {
        // High elevations - rocks/snow
        baseColor = mix(colorMid, colorHigh, clamp((displacement - 0.8) / 0.4, 0.0, 1.0));
    }
    
    vec3 color = baseColor * (ambient + diff);
    
    gl_FragColor = vec4(color, 1.0);
}