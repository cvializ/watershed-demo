precision highp float;

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform sampler2D uCloudShadowMap;
uniform sampler2D uVelocityMap;
uniform float uMinHeight;
uniform float uMaxHeight;
uniform int uShowVelocity; // 0 = show height, 1 = show velocity
uniform sampler2D uSurfaceMaterialMap; // Surface material texture

// Wireframe overlay uniforms (not used with barycentric - kept for future use)
uniform vec3 uWireframeColor;      // Color of wireframe lines
uniform float uWireframeWidth;     // Width of wireframe lines

// Shadow calculation uniforms for sun light
uniform vec3 uLightPosition;
uniform mat4 uLightSpaceMatrix;
uniform sampler2D uShadowMap; // Shadow map for receiving shadows from other objects
uniform bool uHasShadowMap; // Flag indicating if shadow map is active

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition; // World position passed from vertex shader

// Simple shadow calculation from directional light
float calculateShadow(vec3 normal, vec3 worldPosition) {
    // Direction from fragment to light
    vec3 lightDir = normalize(uLightPosition - worldPosition);
    
    // Angle between normal and light direction
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Simple distance-based shadow falloff
    // In a real implementation, you'd use a shadow map texture
    float shadow = 0.5 + 0.5 * diff;
    
    return clamp(shadow, 0.3, 1.0);
}

// Calculate shadow from shadow map (for receiving shadows from other objects like animals)
float calculateShadowFromMap(vec3 worldPosition) {
    if (!uHasShadowMap) {
        return 1.0; // No shadow map, no shadows
    }
    
    // Transform world position to light space
    vec4 shadowPos = uLightSpaceMatrix * vec4(worldPosition, 1.0);
    shadowPos /= shadowPos.w;
    vec2 shadowUv = shadowPos.xy * 0.5 + 0.5;
    
    // Check if within shadow map bounds
    if (shadowUv.x < 0.0 || shadowUv.x > 1.0 || shadowUv.y < 0.0 || shadowUv.y > 1.0) {
        return 1.0; // Outside shadow map, fully lit
    }
    
    // Sample shadow map
    float shadow = texture2D(uShadowMap, shadowUv).r;
    
    // Apply soft shadow (PCF-like effect)
    return mix(0.3, 1.0, smoothstep(0.95, 1.0, shadow));
}

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
vec3 getTerrainMaterialColor(vec2 uv) {
    vec4 materialData = texture2D(uSurfaceMaterialMap, uv);
    float materialType = materialData.r;
    
    // Base colors for each material type
    vec3 colorBareDirt = vec3(0.4, 0.3, 0.2);   // Brownish
    vec3 colorGrass = vec3(0.2, 0.6, 0.2);      // Green
    vec3 colorRocks = vec3(0.5, 0.5, 0.6);      // Grayish
    
    // Return color based on material type
    if (materialType < 0.5) {
        return colorBareDirt;
    } else if (materialType < 1.5) {
        return colorGrass;
    } else {
        return colorRocks;
    }
}

void main() {
    // Use world position passed from vertex shader for accurate shadow calculation
    vec3 worldPosition = vWorldPosition;

    // Sample cloud shadow intensity with blur and expansion
    float cloudShadow = getBlurredShadow(vUv, uCloudShadowMap);
    
    // Calculate animal shadows from shadow map
    float animalShadow = calculateShadowFromMap(worldPosition);
    
    // Get terrain material color
    vec3 terrainMaterialColor = getTerrainMaterialColor(vUv);
    
    // Apply cloud shadows
    if (cloudShadow > 0.01) {
        float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
        terrainMaterialColor *= (1.0 - shadowDarkening);
    }

    // Apply animal shadows to terrain color
    terrainMaterialColor *= animalShadow;
    
    if (cloudShadow > 0.01) {
        float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
        terrainMaterialColor *= (1.0 - shadowDarkening);
    }

    // Sample water height and velocity
    float waterHeight = texture2D(uWaterHeightmap, vUv).r;
    vec4 velocityData = texture2D(uVelocityMap, vUv);
    
    // Visualize water if present
    vec3 finalColor; // Declare at top level scope
    
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
            finalColor = mix(terrainMaterialColor, velocityColor, blendAmount);
            
            gl_FragColor = vec4(finalColor, 1.0);
        } else {
            // Visualize water height (original behavior)
            float waterIntensity = clamp(waterHeight * 3.0, 0.2, 1.0);
            vec3 waterColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.1, 0.3, 0.7), waterIntensity);
            
            // Blend terrain and water (water overlays terrain)
            finalColor = mix(terrainMaterialColor, waterColor, waterIntensity * 0.6);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    } else {
        // No water - just show terrain material color
        finalColor = terrainMaterialColor;
    }

    // Apply animal shadows (injected by onBeforeCompile)
    // finalColor is already multiplied by animalShadow in the injected code
    gl_FragColor = vec4(finalColor, 1.0);
}