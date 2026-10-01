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
uniform float uTime; // Game time, drives the animated crop in the cultivated field
uniform vec2 uWind;  // Wind over the crop, as the weather UI sets it (Wind X / Wind Y),
                     // turned into the field's world xz frame by src/renderer/resources/cropGusts.ts
uniform vec2 uGustDrift; // How far the winds before this one have already dragged the crop's
                         // gust pattern, in world xz, tracked by that same file
uniform float uGustSetTime; // When the wind the crop rides was set, on the same clock

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

// Altitude of the cloud plane above the terrain datum, and the terrain side
// length the cloud/terrain textures span. Kept in step with CLOUD_ALTITUDE in
// src/gpu/waterFlowSimulation/createCloudSphereSystem.ts and TERRAIN_SIZE in
// src/terrain/constants.ts. One texture unit covers the whole world, so the
// shadow a cloud throws is (CLOUD_ALTITUDE - terrainHeight) * cot(elevation)
// divided by TERRAIN_SIZE in uv space.
const float CLOUD_ALTITUDE = 3.5;
const float TERRAIN_SIZE = 40.0;
const float MAX_TERRAIN_HEIGHT = 1.3;

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

// ── Standing grain: the cultivated crop as a field the wind moves over ──
// A crop field is not a flat colour, it is a stand of tall grain, so the
// cultivated material is drawn rather than painted. Three scales of the same
// weather are layered here:
//
// 1. a train of gusts marching along the wind - the pale band of flattened
//    ears that arrives, passes, and is gone;
// 2. patchiness, so gusts start and stop and whole strips of the field sit
//    becalmed between passes;
// 3. heads a fraction of a world unit apart, each catching the light a
//    little differently, which is what makes the field shimmer instead of
//    sliding rigidly.
//
// All three are sampled from world position, so the pattern stays pinned to
// the ground: a gust that has crossed a cell keeps travelling downwind rather
// than crawling with the camera.
//
// The wind is the one the weather pane sets - World > Wind X and Wind Y - kept
// on the same three tracked values the clouds are kept on (see
// src/renderer/resources/cropGusts.ts), and bound by the simulation system
// every pass. Strictly that is the wind at cloud altitude, so the crop waves
// in step with the sky: the tracker hands the shader the direction that wind
// actually blows the clouds along - the pane's vector is a drift in the cloud
// texture's uv frame, which is not the frame the field is drawn in - and the
// distance everything before it has already travelled, so a change of wind
// carries on from the march rather than starting a fresh one, and the harder
// the wind is set the flatter the field lies. Turn the wind off and nothing
// bends at all: the stand stays upright, still ticking a little from head to
// head but never laid over.

// Widths and speeds of the three scales above, and the wind they run on.
// That wind comes straight from the weather pane, where each component runs
// from 0 to 0.5 - 0.707 straight into a corner, so MAX_UI_WIND is the
// strongest wind the pane can set, GUST_SPEED the pace a gust keeps at that
// wind, and CALM_WIND anything too faint to bother the crop with. The same
// three numbers are kept in src/renderer/resources/cropGusts.ts, which banks
// the distance a wind of that strength has already travelled, so a gust stays
// on its march across a wind change rather than restarting from nothing.
const float GUST_WIDTH = 3.0;     // world units from one gust crest to the next
const float GUST_SPEED = 2.5;     // world units a gust travels per second in a
                                  // full wind, less in a lighter one
const float MAX_UI_WIND = 0.707;  // strongest wind the weather UI allows
const float CALM_WIND = 0.01;     // at or below this the field sits becalmed
const float STALK_WIDTH = 0.75;   // world units per head of grain
const float TWO_PI = 6.2831853;

// Cheap hash of a lattice point - enough to drive value noise without
// needing a noise texture.
float hash21(vec2 lattice) {
    return fract(sin(dot(lattice, vec2(127.1, 311.7))) * 43758.5453123);
}

// Value noise in [0, 1] over that lattice. The quintic fade keeps it smooth
// enough that gust edges read as soft rather than as printed stripes.
float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 within = fract(p);
    vec2 fade = within * within * within * (within * (within * 6.0 - 15.0) + 10.0);
    float corner00 = hash21(cell);
    float corner10 = hash21(cell + vec2(1.0, 0.0));
    float corner01 = hash21(cell + vec2(0.0, 1.0));
    float corner11 = hash21(cell + vec2(1.0, 1.0));
    return mix(
        mix(corner00, corner10, fade.x),
        mix(corner01, corner11, fade.x),
        fade.y
    );
}

// Which way the wind over the crop blows, as a unit vector in the field's
// world xz frame, or no direction at all when the weather pane has the wind
// turned off - a becalmed field never samples from it, since
// cropWindForce() is 0 there too. The vector arrives in this frame already:
// src/renderer/resources/cropGusts.ts turns the pane's uv-space drift into it,
// so the crop blows the way the clouds travel rather than at an angle to them.
vec2 cropWindDirection() {
    float windLength = length(uWind);
    if (windLength <= CALM_WIND) {
        return vec2(0.0);
    }
    return uWind / windLength;
}

// How much of that wind the field feels: 0 with the wind off, 1 at the
// strongest wind the weather UI allows, so the crop is never bent more than
// the weather blows. A square-root curve, so a light breeze - the 0.1/0.05
// the pane starts on - still stirs the crop instead of leaving it still.
float cropWindForce() {
    return sqrt(clamp(length(uWind) / MAX_UI_WIND, 0.0, 1.0));
}

// How far the crop's pattern has already been dragged along the wind it rides:
// whatever the winds before this one banked against it, plus this one at that
// pace ever since it was set. Kept as a distance rather than as `time * speed`
// so that turning the wind around, or down to nothing, leaves the field where
// the old wind left it - a gust that was mid-crossing when the sliders moved
// stays mid-crossing, instead of jumping back to wherever the new wind would
// have started it. A wind too faint to name has no direction to measure along,
// so nothing travels.
float gustsTravelled() {
    float windLength = length(uWind);
    if (windLength <= CALM_WIND) {
        return 0.0;
    }
    vec2 windDir = uWind / windLength;

    return dot(uGustDrift, windDir)
         + GUST_SPEED * cropWindForce() * (uTime - uGustSetTime);
}

// How far the crop is bent at a point in the field, roughly -1 (springing
// back up through vertical) to +1 (laid flat by a gust), scaled by the wind:
// a becalmed field keeps the stand upright and still.
float windBend(vec2 field) {
    // Everything is sampled in the wind's own frame, shifted downwind by
    // however far the wind has travelled so far, so a pattern that starts at
    // one edge of a field finishes at the other. A wind too faint to name has
    // no frame to sample in, which is why the two helpers above answer 0 for
    // it.
    vec2 windDir = cropWindDirection();
    float windForce = cropWindForce();
    if (windForce <= 0.0) {
        return 0.0;
    }
    vec2 acrossWind = vec2(-windDir.y, windDir.x);
    vec2 gustUv = (vec2(dot(field, windDir), dot(field, acrossWind))
                   - vec2(gustsTravelled(), 0.0)) / GUST_WIDTH;

    // The train itself, its strength (so gusts come and go), and a
    // cross-wind term that staggers the crests into feathered wedges rather
    // than straight lines right across the field.
    float train = sin(gustUv.x * TWO_PI);
    float strength = valueNoise(gustUv + vec2(0.0, 4.31));
    float stagger = sin((gustUv.y * 0.8 + gustUv.x * 0.5) * TWO_PI);
    return windForce * (0.7 * train * (0.35 + 0.65 * strength) + 0.3 * stagger);
}

// Colour of the crop at a point in the field.
vec3 cropColor(vec2 field) {
    float bend = windBend(field);

    // Three tones of one crop: the shade between the stalks, the standing
    // ears (the swatch colour in surfaceMaterial.ts), and the pale silver of
    // a gust that has laid the field flat and shows the sun the backs of the
    // heads.
    vec3 stalkShade = vec3(0.45, 0.37, 0.2);
    vec3 standingGrain = vec3(0.86, 0.8, 0.4);
    vec3 windSilver = vec3(0.95, 0.9, 0.66);

    // The swatch colour is the mid-tone between the other two, so a gust
    // swings the field either side of the painted colour instead of replacing
    // it: the range measured over a field works out to about 0.47 to 1.0 in
    // the red channel, around a mean of 0.8, so the crop stays recognisably
    // the crop that was painted.
    vec3 crop = bend < 0.0
        ? mix(standingGrain, stalkShade, -bend)
        : mix(standingGrain, windSilver, bend);

    // Fine detail over the waves: heads a fraction of a unit apart, each a
    // little brighter or darker than its neighbour. Stalks are displaced
    // along the wind by however far they bend, and the whole stand drifts
    // through the pattern at a quarter of the distance the wind has covered,
    // which is what keeps it ticking over between gusts. With no wind there is
    // nothing to displace or drag, so the field sits exactly where it was
    // painted.
    float alongWind = bend * STALK_WIDTH - 0.25 * gustsTravelled();
    float heads = valueNoise(field / STALK_WIDTH + cropWindDirection() * alongWind);
    return crop * (0.88 + 0.24 * heads);
}

// Terrain colour for the cell at uv, over the field point at field (the
// second argument is world xz: the crop is drawn in world space, everything
// else is keyed off the painted material id in the texture's R channel).
vec3 getTerrainMaterialColor(vec2 uv, vec2 field) {
    vec4 materialData = texture2D(uSurfaceMaterialMap, uv);
    float materialType = materialData.r;
    
    // Base colors for each material type (kept in step with MATERIAL_PROPERTIES in
    // src/scene/resources/textures/surfaceMaterial.ts). Cultivated is not here:
    // it is a standing crop, drawn by cropColor above, not a flat swatch.
    vec3 colorBareDirt = vec3(0.4, 0.3, 0.2);   // Brownish
    vec3 colorGrass = vec3(0.2, 0.6, 0.2);      // Green
    vec3 colorRocks = vec3(0.5, 0.5, 0.6);      // Grayish
    vec3 colorFallow = vec3(0.55, 0.42, 0.12);  // Dark yellow (stubble on rested ground)
    vec3 colorForest = vec3(0.04, 0.18, 0.06);  // Dark green (closed canopy, seen from above)
    
    // Return color based on material type
    if (materialType < 0.5) {
        return colorBareDirt;
    } else if (materialType < 1.5) {
        return colorGrass;
    } else if (materialType < 2.5) {
        return colorRocks;
    } else if (materialType < 3.5) {
        // Cultivated: standing grain, so it is drawn from the field point and
        // keeps moving in the wind.
        return cropColor(field);
    } else if (materialType < 4.5) {
        return colorFallow;
    } else {
        return colorForest;
    }
}

void main() {
    // Use world position passed from vertex shader for accurate shadow calculation
    vec3 worldPosition = vWorldPosition;

    // Calculate sunlight lighting based on surface normal and light direction
    float sunLighting = calculateShadow(vNormal, worldPosition);

    // Sample the cloud shadow offset along the sun's azimuth so the shadow
    // tracks the sun: the cloud that hides the sun from this point sits between
    // this point and the sun, so we look up-sun. With the sun overhead the
    // shadow lies directly under each cloud (zero offset); as the sun sinks
    // toward the horizon the shadow is thrown farther across the terrain.
    vec3 toSun = normalize(uLightPosition - worldPosition);
    // uv.x tracks world x and uv.y tracks world z, so the horizontal sun
    // direction maps straight into the shared terrain/cloud uv frame.
    vec2 toSunUv = vec2(toSun.x, toSun.z);
    // Account for terrain height: the cloud-to-ground distance varies with
    // elevation, so the shadow offset must shrink on high ground where the
    // cloud plane (fixed at CLOUD_ALTITUDE) is closer to the surface.
    float terrainHeight = texture2D(uHeightMap, vUv).r * MAX_TERRAIN_HEIGHT;
    float cloudToGround = CLOUD_ALTITUDE - terrainHeight;
    float shadowUv = min((cloudToGround / max(toSun.y, 0.1)) / TERRAIN_SIZE, 0.2);

    // Sample cloud shadow intensity with blur and expansion
    float cloudShadow = getBlurredShadow(vUv + toSunUv * shadowUv, uCloudShadowMap);
    
    // Calculate animal shadows from shadow map
    float animalShadow = calculateShadowFromMap(worldPosition);
    
    // Get terrain material color
    vec3 terrainMaterialColor = getTerrainMaterialColor(vUv, worldPosition.xz);
    
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