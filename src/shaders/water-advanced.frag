/**
 * Advanced water visualization shader with realistic flow appearance
 * Uses GPU-computed water height and velocity for rendering
 */
precision highp float;

uniform sampler2D uWaterHeightMap;   // Water height from simulation
uniform sampler2D uVelocityMap;      // Velocity field for flow direction
uniform sampler2D uDisplacementMap;  // Terrain height map
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

// Water properties
const vec3 DEEP_WATER_COLOR = vec3(0.0, 0.2, 0.5);
const vec3 SHALLOW_WATER_COLOR = vec3(0.1, 0.6, 1.0);
const vec3 SURFACE_COLOR = vec3(0.2, 0.7, 1.0);
const float REFLECTIVITY = 0.3;
const float FRESNEL_POWER = 5.0;

// Caustics pattern
vec3 causticPattern(vec2 uv, float time) {
    vec2 scaledUV = uv * 10.0;
    float pattern = 0.0;
    
    // Multiple wave patterns for caustics
    pattern += sin(scaledUV.x + time * 2.0) * cos(scaledUV.y + time * 1.5);
    pattern += sin(scaledUV.x * 0.8 + scaledUV.y * 0.6 + time) * 0.5;
    pattern += cos(scaledUV.x * 1.2 - scaledUV.y * 0.9 + time * 1.3) * 0.3;
    
    // Normalize to positive range
    return vec3(0.5 + 0.5 * pattern);
}

void main() {
    float eps = 1.0 / max(uResolution.x, uResolution.y);
    
    // Read water simulation results
    float waterHeight = texture2D(uWaterHeightMap, vUv).r;
    vec2 velocity = texture2D(uVelocityMap, vUv).rg;
    
    // Read terrain height
    float terrainHeight = texture2D(uDisplacementMap, vUv).r;
    
    // Calculate water surface normal from height gradient
    float hLeft = texture2D(uWaterHeightMap, vUv - vec2(eps, 0.0)).r;
    float hRight = texture2D(uWaterHeightMap, vUv + vec2(eps, 0.0)).r;
    float hDown = texture2D(uWaterHeightMap, vUv - vec2(0.0, eps)).r;
    float hUp = texture2D(uWaterHeightMap, vUv + vec2(0.0, eps)).r;
    
    // Surface normal (using height gradient)
    vec3 normal = normalize(vec3(hLeft - hRight, hDown - hUp, 2.0 * eps));
    
    // Simple lighting calculation
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
    vec3 viewDir = normalize(vec3(vUv.x - 0.5, vUv.y - 0.5, 1.0));
    
    // Diffuse lighting
    float diffuse = max(dot(normal, lightDir), 0.0);
    
    // Specular highlight (Phong)
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);
    
    // Fresnel effect
    float fresnel = pow(1.0 - dot(viewDir, normal), FRESNEL_POWER);
    
    // Water color based on height
    vec3 waterColor;
    if (waterHeight < 0.2) {
        // Very shallow - lighter color
        waterColor = mix(SURFACE_COLOR, SHALLOW_WATER_COLOR, waterHeight * 5.0);
    } else if (waterHeight < 0.8) {
        // Medium depth
        waterColor = mix(SHALLOW_WATER_COLOR, DEEP_WATER_COLOR, (waterHeight - 0.2) / 0.6);
    } else {
        // Deep water
        waterColor = DEEP_WATER_COLOR;
    }
    
    // Add caustics pattern (增强效果)
    vec3 caustics = causticPattern(vUv * 2.0, uTime);
    waterColor += vec3(0.1) * caustics * min(waterHeight, 0.5);
    
    // Surface details (waves on surface)
    float waveDetail = sin(vUv.x * 20.0 + uTime * 5.0 + velocity.x * 10.0) * 
                       cos(vUv.y * 20.0 + uTime * 3.0 + velocity.y * 10.0);
    waterColor += vec3(0.05) * waveDetail * 0.2;
    
    // Combine lighting effects
    vec3 finalColor = waterColor * (0.3 + 0.7 * diffuse);
    finalColor += vec3(1.0) * spec * REFLECTIVITY;
    
    // Add sky reflection via Fresnel
    vec3 skyColor = vec3(0.1, 0.2, 0.4);
    finalColor = mix(finalColor, skyColor, fresnel * REFLECTIVITY);
    
    // Opacity based on water depth
    float opacity = clamp(waterHeight * 0.8 + 0.2, 0.1, 0.9);
    
    // Edge fading for transparency
    if (waterHeight < 0.05) {
        opacity *= waterHeight * 20.0;
    }
    
    gl_FragColor = vec4(finalColor, opacity);
}