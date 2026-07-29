uniform sampler2D uCloudTexture;
uniform vec3 uCameraPosition;
uniform float uTime;

varying vec2 vUv;

/**
 * Get blurred shadow with bleed and expansion effect using multiple samples.
 * This creates a soft, expanded shadow effect for clouds.
 */
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

void main() {
    // Sample cloud density from texture using blurred shadow
    float cloudDensity = getBlurredShadow(vUv, uCloudTexture);
    
    if (cloudDensity > 0.01) {
        // Scale density for better visibility
        float scaledDensity = clamp(cloudDensity * 0.8, 0.0, 0.7);
        
        // Apply smoothstep for better cloud definition
        scaledDensity = smoothstep(0.2, 0.8, scaledDensity);
        
        // Cloud color - white/gray with slight blue tint
        vec3 cloudColor = vec3(0.95, 0.98, 1.0);
        
        // Translucent look - more transparent where density is low
        float alpha = smoothstep(0.1, 0.8, scaledDensity);
        
        // Final cloud color with alpha
        gl_FragColor = vec4(cloudColor * scaledDensity, alpha);
    } else {
        // Transparent where no clouds
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
}