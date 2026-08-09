precision highp float;

uniform sampler2D uHeightMap;
uniform vec3 uWireColor;
uniform float uLineWidth;

varying vec2 vUv;

// Simple wireframe using UV grid pattern
void main() {
    // Sample height for base color (to match terrain visualization)
    float h = texture2D(uHeightMap, vUv).r;
    
    // Create wireframe grid pattern based on UV coordinates
    // This draws lines at regular intervals to show mesh structure
    float gridSpacing = 1.0 / 80.0; // Match terrain segments (80x80)
    
    float xDist = fract(vUv.x / gridSpacing) * gridSpacing;
    float yDist = fract(vUv.y / gridSpacing) * gridSpacing;
    
    // Distance to nearest grid line
    float distToLine = min(xDist, yDist);
    
    // Anti-aliased line width
    float lineWidth = uLineWidth / 100.0;
    float lineAlpha = 1.0 - smoothstep(0.0, lineWidth, distToLine);
    
    // Output wireframe color with height-based brightness
    float brightness = clamp((h + 1.5) / 3.5, 0.0, 1.0);
    vec3 baseColor = vec3(brightness * 0.5);
    
    vec3 finalColor = mix(baseColor, uWireColor, lineAlpha);
    
    gl_FragColor = vec4(finalColor, 1.0);
}