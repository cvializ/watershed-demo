precision highp float;

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform sampler2D uCloudShadowMap;
uniform sampler2D uVelocityMap;
uniform float uMinHeight;
uniform float uMaxHeight;
uniform int uShowVelocity; // 0 = show height, 1 = show velocity

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

// Visualize water based on height or velocity
void main() {
    // Base terrain color
    vec3 terrainColor = vec3(0.4, 0.3, 0.2); // Brownish terrain
    
    // Sample cloud shadow intensity with blur and expansion
    float cloudShadow = getBlurredShadow(vUv, uCloudShadowMap);

    // Apply cloud shadow to terrain where there's no water
    float finalAlpha = 1.0;
    vec3 finalColor = terrainColor;
    
    if (cloudShadow > 0.01) {
        float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
        finalColor *= (1.0 - shadowDarkening);
    }

    // Sample water height and velocity
    float waterHeight = texture2D(uWaterHeightmap, vUv).r;
    vec4 velocityData = texture2D(uVelocityMap, vUv);
    
    // Visualize water if present
    if (waterHeight > 0.01) {
        if (uShowVelocity == 1) {
            // Visualize velocity magnitude (not direction)
            float velMag = velocityData.b; // Magnitude is stored in blue channel
            
            // Color gradient: Blue (low) -> Green (medium) -> Red (high)
            vec3 velocityColor;
            if (velMag < 0.5) {
                // Low velocity - blue
                velocityColor = vec3(0.2, 0.4, 1.0);
            } else if (velMag < 2.0) {
                // Medium velocity - green
                velocityColor = vec3(0.2, 1.0, 0.4);
            } else {
                // High velocity - red
                velocityColor = vec3(1.0, 0.4, 0.2);
            }
            
            // Blend with terrain - make velocity more visible
            float blendAmount = clamp(velMag * 0.5 + 0.3, 0.3, 1.0);
            finalColor = mix(terrainColor, velocityColor, blendAmount);
        } else {
            // Visualize water height (original behavior)
            float waterIntensity = clamp(waterHeight * 3.0, 0.2, 1.0);
            vec3 waterColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.1, 0.3, 0.7), waterIntensity);
            
            // Blend terrain and water (water overlays terrain)
            finalColor = mix(terrainColor, waterColor, waterIntensity * 0.6);
        }
    }
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}