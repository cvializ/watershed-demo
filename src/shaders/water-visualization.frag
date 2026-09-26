precision highp float;

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform sampler2D uCloudShadowMap;
uniform sampler2D uVelocityMap;
uniform sampler2D uPollutantMap; // Water column: four channels of column-integrated mass (R N, G organic, B dissolved oxygen, A bacteria)
uniform sampler2D uTerrainSubstanceMap; // Ground: the compartments the soil owns (R bacteria, G organic matter), see terrain-quality.frag
uniform float uShowPollutants;   // 1 = tint the terrain by the selected substance, 0 = leave it alone
uniform float uPollutantSpecies; // Which substance to show: 0 nitrogen, 1 organic matter, 2 dissolved oxygen, 3 bacteria
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

// Mass per unit area at which a substance reads as half-strength on screen.
const float HALF_SATURATING_MASS = 0.35;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition; // World position passed from vertex shader

// Simple shadow calculation from directional light
float calculateShadow(vec3 normal, vec3 worldPosition) {
    // Check if sun is above horizon (y > 0)
    // If sun is below horizon, return ambient lighting only (no directional shadows)
    if (uLightPosition.y <= 0.0) {
        return 0.3; // Ambient lighting when sun is below horizon - terrain stays visible
    }
    
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

// Species ids of the substances with a ground compartment as well as a water one, and thus the only ones whose view
// reads the terrain texture. Mirrors POLLUTANT_SPECIES in
// src/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts. The ids are not channel indices across textures:
// the water column packs bacteria in A (so species 3 is its channel 3) while the ground packs bacteria in R and
// organic matter in G and leaves B and A at zero, so species 3 is the terrain's channel 0. See
// src/shaders/compute/terrain-quality.frag.
const float SPECIES_ORGANIC_MATTER = 1.0;
const float SPECIES_BACTERIA = 3.0;

// Substance tint for the selected species: colour in rgb, mix weight in w.
//
// Channels are mass per unit area rather than concentration. A deep puddle and a damp film of equal strength
// therefore read differently here, which is fine for "where did it go" and cheaper than dividing by a depth that
// approaches zero wherever the simulation has just drained water away.
vec4 pollutantTint(vec2 uv) {
    vec4 mass = texture2D(uPollutantMap, uv);

    // GLSL ES 1.00 cannot index a vec4 with a runtime value, so the selector is a 0/1 mask over the channel
    // indices rather than mass[int(uPollutantSpecies)].
    vec4 channelMask = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - vec4(uPollutantSpecies)), vec4(0.5));
    float fromWater = max(dot(mass, channelMask), 0.0);

    // Bacteria and organic matter have a second home, so they alone add the ground's share - each of its own channel,
    // because the two are different substances rather than two names for dirt, and because the ground files them the
    // other way round from the film above it: R is bacterial content, G is organic matter. Reusing the water
    // column's layout here (bacteria in slot A) reads the terrain's unused B and A, which stay zero, so a Bacteria
    // view lost every cell that had banked its load in the soil - which is precisely where a film crossing a manure
    // pat was handing its load over, and why nothing ever turned magenta over organic matter.
    // This is what keeps a contaminated flood plain readable once its puddles are gone, and what makes the pats
    // animals left visible while the land is dry. Nitrogen has no dry counterpart in the terrain texture, and
    // dissolved oxygen cannot even keep one - water-quality.frag lets it evaporate with the film it was dissolved in,
    // so an oxygen view simply goes blank where water has left.
    vec4 soilMass = max(texture2D(uTerrainSubstanceMap, uv), 0.0);
    float organicSelector =
        1.0 - min(abs(uPollutantSpecies - SPECIES_ORGANIC_MATTER), 1.0);
    float bacteriaSelector = 1.0 - min(abs(uPollutantSpecies - SPECIES_BACTERIA), 1.0);
    float fromGround = dot(soilMass, vec4(bacteriaSelector, organicSelector, 0.0, 0.0));

    float selected = fromWater + fromGround;

    // One component per species, read out with the same mask: nitrogen yellow-green, organic brown, oxygen cyan,
    // bacteria magenta. Mirrors POLLUTANT_SPECIES in src/gpu/waterFlowSimulation/variables/createGpuWaterQuality.ts.
    const vec4 TINT_R = vec4(0.92, 0.55, 0.15, 0.95);
    const vec4 TINT_G = vec4(0.95, 0.32, 0.85, 0.25);
    const vec4 TINT_B = vec4(0.25, 0.12, 0.95, 0.85);

    // Saturating curve: half this much mass is halfway to full colour, and no amount floods the screen.
    float strength = selected / (selected + HALF_SATURATING_MASS);

    return vec4(
        dot(TINT_R, channelMask),
        dot(TINT_G, channelMask),
        dot(TINT_B, channelMask),
        strength * 0.92
    );
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

    // Calculate sunlight lighting based on surface normal and light direction
    float sunLighting = calculateShadow(vNormal, worldPosition);

    // Sample cloud shadow intensity with blur and expansion
    float cloudShadow = getBlurredShadow(vUv, uCloudShadowMap);
    
    // Calculate animal shadows from shadow map
    float animalShadow = calculateShadowFromMap(worldPosition);
    
    // Get terrain material color
    vec3 terrainMaterialColor = getTerrainMaterialColor(vUv);
    
    // Apply sunlight lighting first
    terrainMaterialColor *= sunLighting;
    
    // Apply cloud shadows only when sun is above horizon
    if (uLightPosition.y > 0.0 && cloudShadow > 0.01) {
        float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
        terrainMaterialColor *= (1.0 - shadowDarkening);
    }

    // Apply animal shadows only when sun is above horizon
    if (uLightPosition.y > 0.0) {
        terrainMaterialColor *= animalShadow;
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
        } else {
            // Visualize water height (original behavior)
            float waterIntensity = clamp(waterHeight * 3.0, 0.2, 1.0);
            vec3 waterColor = mix(vec3(0.4, 0.7, 1.0), vec3(0.1, 0.3, 0.7), waterIntensity);
            
            // Blend terrain and water (water overlays terrain)
            finalColor = mix(terrainMaterialColor, waterColor, waterIntensity * 0.6);
        }
    } else {
        // No water - just show terrain material color
        finalColor = terrainMaterialColor;
    }

    // Substance overlay: wet cells and dry ground both read, since what drained water leaves behind - and, for
    // bacteria, what the ground itself is holding - is the part of the story a water-only view would hide.
    if (uShowPollutants > 0.5) {
        vec4 tint = pollutantTint(vUv);
        finalColor = mix(finalColor, tint.rgb, clamp(tint.w, 0.0, 1.0));
    }

    // Apply animal shadows (injected by onBeforeCompile)
    // finalColor is already multiplied by animalShadow in the injected code
    gl_FragColor = vec4(finalColor, 1.0);
}