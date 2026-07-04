precision highp float;

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform float uMinHeight;
uniform float uMaxHeight;

varying vec2 vUv;

// Simple water visualization - blue overlay based on water height
void main() {
    // Base terrain color
    vec3 terrainColor = vec3(0.4, 0.3, 0.2); // Brownish terrain
    
    // Sample water height
    float waterHeight = texture2D(uWaterHeightmap, vUv).r;
    
    // Visualize water if present
    vec3 finalColor = terrainColor;
    
    if (waterHeight > 0.01) {
        // Simple water color - lighter blue for shallow, darker for deeper
        float waterIntensity = clamp(waterHeight * 3.0, 0.2, 1.0);
        vec3 waterColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.1, 0.3, 0.7), waterIntensity);
        
        // Blend terrain and water (water overlays terrain)
        finalColor = mix(terrainColor, waterColor, waterIntensity * 0.6);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
}