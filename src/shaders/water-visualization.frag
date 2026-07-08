precision highp float;

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform sampler2D uCloudShadowMap;
uniform float uMinHeight;
uniform float uMaxHeight;

varying vec2 vUv;
varying vec3 vNormal;

// Expand shadow with bleed and blur effect using multiple samples
float getBlurredShadow(vec2 uv, sampler2D shadowMap) {
    float shadow = 0.0;
    
    // Shadow bleed expansion (controls how much the shadow spreads)
    float bleedOffset = 0.05; // Larger offset for farther shadow extension
    
    // Blur offset (smaller for fine blur)
    float blurOffset = 0.1;
    
    // Sample neighbors with bleed expansion
    vec2 offsets[9];
    // Top row - expanded outward
    offsets[0] = vec2(-bleedOffset - blurOffset, bleedOffset + blurOffset);
    offsets[1] = vec2(0.0, bleedOffset);
    offsets[2] = vec2(bleedOffset + blurOffset, bleedOffset + blurOffset);
    
    // Middle row
    offsets[3] = vec2(-bleedOffset, 0.0);
    offsets[4] = vec2(0.0, 0.0); // Center
    offsets[5] = vec2(bleedOffset, 0.0);
    
    // Bottom row - expanded outward
    offsets[6] = vec2(-bleedOffset - blurOffset, -bleedOffset - blurOffset);
    offsets[7] = vec2(0.0, -bleedOffset);
    offsets[8] = vec2(bleedOffset + blurOffset, -bleedOffset - blurOffset);
    
    // 3x3 Gaussian-like kernel
    float kernel[9];
    kernel[0] = 1.0; kernel[1] = 2.0; kernel[2] = 1.0;
    kernel[3] = 2.0; kernel[4] = 4.0; kernel[5] = 2.0;
    kernel[6] = 1.0; kernel[7] = 2.0; kernel[8] = 1.0;
    
    float totalWeight = 16.0; // Sum of kernel values (excluding center weight)
    
    for (int i = 0; i < 9; i++) {
        vec2 sampleUV = uv + offsets[i];
        float sampleShadow = texture2D(shadowMap, sampleUV).r;
        shadow += sampleShadow * kernel[i];
    }
    
    return shadow / totalWeight;
}

// Simple water visualization - blue overlay based on water height
void main() {
    // Base terrain color
    vec3 terrainColor = vec3(0.4, 0.3, 0.2); // Brownish terrain
    
    // Sample water height
    float waterHeight = texture2D(uWaterHeightmap, vUv).r;
    
    // Sample cloud shadow intensity with blur and expansion
    float cloudShadow = getBlurredShadow(vUv, uCloudShadowMap);
    
    // Visualize water if present
    vec3 finalColor = terrainColor;
    
    if (waterHeight > 0.01) {
        // Simple water color - lighter blue for shallow, darker for deeper
        float waterIntensity = clamp(waterHeight * 3.0, 0.2, 1.0);
        vec3 waterColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.1, 0.3, 0.7), waterIntensity);
        
        // Blend terrain and water (water overlays terrain)
        finalColor = mix(terrainColor, waterColor, waterIntensity * 0.6);
    } else {
        // Apply cloud shadow to terrain where there's no water
        if (cloudShadow > 0.01) {
            float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
            finalColor *= (1.0 - shadowDarkening);
        }
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
}