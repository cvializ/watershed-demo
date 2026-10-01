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

// ── Standing grain: the cultivated crop as a field the wind moves over ──
// Same effect as in water-visualization.frag, so a crop field looks the same
// from the water it grew on as it does from above it: a train of gusts
// marching along the wind, patchy enough to start and stop, over heads a
// fraction of a world unit apart that each catch the light differently. All
// of it sampled in world space, so the field stays pinned to the ground.
// The wind stays a standing assumption about this valley - the world has no
// surface wind field to bind, only cloud drift, which is wind at cloud
// altitude and would make the crop wave in step with the sky.

// Wind from the south-west, as a 3-4-5 triangle so the direction is exactly
// normalised, and the widths and speed of the three scales above.
const vec2 WIND_DIR = vec2(0.8, 0.6);
const float GUST_WIDTH = 3.0;   // world units from one gust crest to the next
const float GUST_SPEED = 2.5;   // world units a gust travels per second
const float STALK_WIDTH = 0.75; // world units per head of grain
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

// How far the crop is bent at a point in the field, roughly -1 (springing
// back up through vertical) to +1 (laid flat by a gust).
float windBend(vec2 field) {
    // Sampled in the wind's own frame, shifted downwind by however far the
    // wind has travelled, so a pattern that starts at one edge of a field
    // finishes at the other.
    vec2 acrossWind = vec2(-WIND_DIR.y, WIND_DIR.x);
    vec2 gustUv = (vec2(dot(field, WIND_DIR), dot(field, acrossWind))
                   - vec2(uTime * GUST_SPEED, 0.0)) / GUST_WIDTH;

    // The train itself, its strength (so gusts come and go), and a
    // cross-wind term that staggers the crests into feathered wedges rather
    // than straight lines right across the field.
    float train = sin(gustUv.x * TWO_PI);
    float strength = valueNoise(gustUv + vec2(0.0, 4.31));
    float stagger = sin((gustUv.y * 0.8 + gustUv.x * 0.5) * TWO_PI);
    return 0.7 * train * (0.35 + 0.65 * strength) + 0.3 * stagger;
}

// Colour of the crop at a point in the field: the shade between the stalks,
// the standing ears (the swatch colour in surfaceMaterial.ts), and the pale
// silver of a gust that has laid the field flat and shows the sun the backs
// of the heads - interpolated through the swatch, which is the mid-tone
// between those two, so gusts swing the field either side of the painted
// colour (about 0.47 to 1.0 in the red channel, mean around 0.8) instead of
// replacing it. A head-sized noise on top keeps the stand flickering.
vec3 cropColor(vec2 field) {
    float bend = windBend(field);

    vec3 stalkShade = vec3(0.45, 0.37, 0.2);
    vec3 standingGrain = vec3(0.86, 0.8, 0.4);
    vec3 windSilver = vec3(0.95, 0.9, 0.66);

    vec3 crop = bend < 0.0
        ? mix(standingGrain, stalkShade, -bend)
        : mix(standingGrain, windSilver, bend);

    // Fine detail over the waves: heads a fraction of a unit apart, each a
    // little brighter or darker than its neighbour. Stalks are displaced
    // along the wind as they bend, so the lookup is dragged with them, and
    // the extra slow drift keeps the stand ticking over between gusts.
    float alongWind = bend * STALK_WIDTH - uTime * 0.25;
    float heads = valueNoise(field / STALK_WIDTH + WIND_DIR * alongWind);
    return crop * (0.88 + 0.24 * heads);
}

// Terrain colour for the cell at uv, over the field point at field (world
// xz, so the crop is drawn in world space while everything else is keyed off
// the painted material id in the texture's R channel). Kept in step with
// water-visualization.frag.
vec3 getTerrainMaterialColor(vec2 uv, vec2 field) {
    vec4 materialData = texture2D(uSurfaceMaterialMap, uv);
    float materialType = materialData.r;

    // Base colors for each surface material type (kept in step with
    // MATERIAL_PROPERTIES in src/scene/resources/textures/surfaceMaterial.ts).
    // Cultivated is not here: it is a standing crop, drawn by cropColor
    // above, not a flat swatch.
    vec3 colorBareDirt = vec3(0.4, 0.3, 0.2);   // Brownish
    vec3 colorGrass = vec3(0.2, 0.6, 0.2);       // Green
    vec3 colorRocks = vec3(0.5, 0.5, 0.6);       // Grayish
    vec3 colorFallow = vec3(0.55, 0.42, 0.12);   // Dark yellow (stubble on rested ground)
    vec3 colorForest = vec3(0.04, 0.18, 0.06);   // Dark green (closed canopy, seen from above)

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
        vec3 terrainColor = getTerrainMaterialColor(vUv, vWorldPosition.xz);
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
        finalColor = getTerrainMaterialColor(vUv, vWorldPosition.xz) * shading;
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
