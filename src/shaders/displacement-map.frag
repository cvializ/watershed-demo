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
    vec3 colorLow = vec3(0.1, 0.4, 0.8);   // Blue for low elevations
    vec3 colorHigh = vec3(0.6, 0.6, 0.6);  // Gray for high elevations
    vec3 baseColor = mix(colorLow, colorHigh, clamp(displacement * 0.5 + 0.5, 0.0, 1.0));
    
    vec3 color = baseColor * (ambient + diff);
    
    gl_FragColor = vec4(color, 1.0);
}