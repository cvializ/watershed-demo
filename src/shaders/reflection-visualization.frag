precision highp float;

uniform sampler2D uWaterHeightmap;
uniform sampler2D uCloudShadowMap;
uniform sampler2D uSurfaceMaterialMap; // Surface material texture
uniform float uTime;                   // Game time, used to animate surface ripples
uniform vec3 uLightPosition;           // Sun position (treated as a point light, like water-visualization.frag)

// Altitude of the cloud plane above the terrain datum, and the terrain side
// length the cloud/terrain textures span. Kept in step with CLOUD_ALTITUDE in
// src/gpu/waterFlowSimulation/createCloudSphereSystem.ts and TERRAIN_SIZE in
// src/terrain/constants.ts.
const float CLOUD_ALTITUDE = 3.5;
const float TERRAIN_SIZE = 40.0;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// Base colors for each surface material type (kept in step with MATERIAL_PROPERTIES in
// src/scene/resources/textures/surfaceMaterial.ts, same as water-visualization.frag)
vec3 getTerrainMaterialColor(vec2 uv) {
    vec4 materialData = texture2D(uSurfaceMaterialMap, uv);
    float materialType = materialData.r;

    vec3 colorBareDirt = vec3(0.4, 0.3, 0.2);   // Brownish
    vec3 colorGrass = vec3(0.2, 0.6, 0.2);       // Green
    vec3 colorRocks = vec3(0.5, 0.5, 0.6);       // Grayish
    vec3 colorCultivated = vec3(0.86, 0.8, 0.4); // Light yellow (crop field)
    vec3 colorFallow = vec3(0.55, 0.42, 0.12);   // Dark yellow (stubble on rested ground)
    vec3 colorForest = vec3(0.04, 0.18, 0.06);   // Dark green (closed canopy, seen from above)

    if (materialType < 0.5) {
        return colorBareDirt;
    } else if (materialType < 1.5) {
        return colorGrass;
    } else if (materialType < 2.5) {
        return colorRocks;
    } else if (materialType < 3.5) {
        return colorCultivated;
    } else if (materialType < 4.5) {
        return colorFallow;
    } else {
        return colorForest;
    }
}

// How much of the daylight survives: 1 while the sun is well above the
// horizon, fading to 0 as it sinks below it. Everything the water reflects
// or refracts is scaled by this, so the view darkens into night as the sun
// travels under the horizon and brightens again at dawn.
float daylight(vec3 sunDir) {
    return smoothstep(-0.15, 0.1, sunDir.y);
}

// Cheap analytic ripple field. Two incommensurate sine products give a water-like
// chop without a noise texture; the surface normal is its finite-difference gradient.
float rippleHeight(vec2 p) {
    return 0.004 * sin(p.x * 30.0 + uTime * 1.3) * sin(p.y * 27.0 - uTime * 1.1)
         + 0.002 * sin(p.x * 61.0 - uTime * 2.1) * sin(p.y * 53.0 + uTime * 1.7);
}

// Reflecting water surface normal: terrain slope (geometry normal) blended with
// the animated ripple bump so highlights streak and shift as the camera moves.
vec3 waterSurfaceNormal(vec3 worldPos, vec3 geomNormal) {
    float eps = 0.05;
    vec2 p = worldPos.xz;
    float hCenter = rippleHeight(p);
    float hX = rippleHeight(p + vec2(eps, 0.0));
    float hZ = rippleHeight(p + vec2(0.0, eps));
    float slopeX = (hX - hCenter) / eps;
    float slopeZ = (hZ - hCenter) / eps;
    vec3 bumpNormal = normalize(vec3(-slopeX, 1.0, -slopeZ));
    return normalize(mix(geomNormal, bumpNormal, 0.35));
}

// Sky sampled along the reflected view ray, keyed off the sun's position:
// the day/night gradient dims with the sun's height, a warm sunset band
// appears along the sun's azimuth while it is low, and the sun disc and its
// halo sit exactly where the sun is - so as the sun crosses the sky, the
// streak of sun glitter wanders across the water to keep facing it.
vec3 skyColor(vec3 reflectDir, vec3 sunDir) {
    float day = daylight(sunDir);
    float sunHeight = clamp(sunDir.y, 0.0, 1.0);

    // Vertical gradient, dark version blended in as the sun sets
    float elevation = clamp(reflectDir.y, 0.0, 1.0);
    vec3 zenith = mix(vec3(0.01, 0.02, 0.06), vec3(0.08, 0.28, 0.72), day);
    vec3 horizon = mix(vec3(0.05, 0.06, 0.12), vec3(0.72, 0.82, 0.94), day);
    vec3 sky = mix(zenith, horizon, pow(1.0 - elevation, 3.0));

    // Sunset/sunrise: while the sun is low, the sky towards its azimuth
    // glows warm, brightest near the horizon.
    float lowSun = 1.0 - smoothstep(0.0, 0.35, sunHeight);
    vec2 reflectFlat = reflectDir.xz;
    if (length(reflectFlat) > 0.001) {
        vec3 reflectFlatDir = normalize(vec3(reflectFlat.x, 0.0, reflectFlat.y));
        vec3 sunFlatDir = normalize(vec3(sunDir.x, 0.0, sunDir.z));
        float towardsSun = max(dot(reflectFlatDir, sunFlatDir), 0.0);
        float glow = pow(towardsSun, 2.0) * lowSun * (1.0 - elevation);
        sky = mix(sky, vec3(1.0, 0.45, 0.18), clamp(glow, 0.0, 0.85));
    }

    // The sun itself: a bright disc exactly along the sun direction with a
    // wider halo around it, visible only while the sun is up.
    float sunAmount = max(dot(reflectDir, sunDir), 0.0);
    sky += vec3(1.0, 0.95, 0.8) * pow(sunAmount, 128.0) * 1.2 * day;
    sky += vec3(0.9, 0.7, 0.45) * pow(sunAmount, 12.0) * 0.3 * day;

    return sky;
}

void main() {
    float waterHeight = texture2D(uWaterHeightmap, vUv).r;
    vec3 sunDir = normalize(uLightPosition - vWorldPosition);
    float day = daylight(sunDir);
    bool sunIsUp = uLightPosition.y > 0.0;
    vec3 finalColor;

    if (waterHeight > 0.01) {
        // Reflective water: reflect the view ray off the rippling surface
        // and light the visible terrain with a Fresnel-weighted sky.
        vec3 surfaceNormal = waterSurfaceNormal(vWorldPosition, normalize(vNormal));
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 reflectDir = reflect(-viewDir, surfaceNormal);
        vec3 sky = skyColor(reflectDir, sunDir);

        // What shows through the water: the terrain below, tinted bluer and
        // darker the deeper the film gets, and dimmed after sunset.
        vec3 terrainColor = getTerrainMaterialColor(vUv);
        vec3 deepWaterColor = vec3(0.01, 0.09, 0.28);
        vec3 refractedColor = mix(terrainColor * 0.7, deepWaterColor,
                                  clamp(waterHeight * 1.5, 0.4, 0.9));
        refractedColor *= (0.25 + 0.75 * day);

        // Fresnel: grazing angles mirror the sky almost perfectly,
        // looking straight down you mostly see through the water.
        float cosTheta = clamp(dot(viewDir, surfaceNormal), 0.0, 1.0);
        float fresnel = 0.05 + 0.95 * pow(1.0 - cosTheta, 4.0);
        finalColor = mix(refractedColor, sky, fresnel);
    } else {
        // No water - show the terrain lit by the sun, same as the water
        // height view's dry-ground path.
        vec3 geomNormal = normalize(vNormal);
        float sunLighting = max(dot(geomNormal, sunDir), 0.0);
        float shading = 0.3 + 0.7 * sunLighting;
        finalColor = getTerrainMaterialColor(vUv) * shading;
    }

    // Clouds passing overhead darken both the reflection and the terrain. Sample
    // the cloud field up-sun: the cloud that hides the sun from this point sits
    // between this point and the sun, so as the sun sinks the shadow it throws
    // is displaced farther across the terrain (sunDir.xz maps into the shared
    // terrain/cloud uv frame; reach is clamped so it stays on the field).
    float shadowUv = min((CLOUD_ALTITUDE / max(sunDir.y, 0.1)) / TERRAIN_SIZE, 0.2);
    float cloudShadow = texture2D(uCloudShadowMap, vUv + vec2(sunDir.x, sunDir.z) * shadowUv).r;
    if (sunIsUp && cloudShadow > 0.01) {
        float shadowDarkening = clamp(cloudShadow * 0.8, 0.0, 0.7);
        finalColor *= (1.0 - shadowDarkening);
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
