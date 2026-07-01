precision highp float;

uniform sampler2D uHeightMap;     // Terrain height map
uniform sampler2D uWaterMap;      // Previous water distribution
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
    float eps = 1.0 / 512.0; // Texture texel size
    
    // Read current water level and terrain height
    float prevWaterLevel = texture2D(uWaterMap, vUv).r;
    float terrainHeight = texture2D(uHeightMap, vUv).r;
    
    // Sample neighboring heights for gradient computation
    float hLeft = texture2D(uHeightMap, vUv - vec2(eps, 0.0)).r;
    float hRight = texture2D(uHeightMap, vUv + vec2(eps, 0.0)).r;
    float hDown = texture2D(uHeightMap, vUv - vec2(0.0, eps)).r;
    float hUp = texture2D(uHeightMap, vUv + vec2(0.0, eps)).r;
    
    // Compute flow direction (downhill)
    vec2 gradient = vec2(hRight - hLeft, hUp - hDown);
    float gradientLen = length(gradient) + 0.001;
    vec2 flowDir = -normalize(gradient);
    
    // Read water from upstream position (water flowing from here)
    vec2 upStreamUV = vUv - flowDir * eps * 1.5;
    float upstreamWater = texture2D(uWaterMap, clamp(upStreamUV, 0.0, 1.0)).r;
    
    // Calculate terrain properties
    float avgSurrounding = (hLeft + hRight + hDown + hUp) * 0.25;
    float isBasin = max(0.0, avgSurrounding - terrainHeight);
    
    // Slope-based drainage (higher and steeper = more drain)
    float slope = gradientLen;
    float elevationFactor = smoothstep(-1.5, 1.0, terrainHeight);
    
    // Water flows downhill carrying water with it
    float advectedWater = upstreamWater * 0.95;
    
    // Drain water from high slopes (water runs off) - reduced drain rate significantly
    float drain = elevationFactor * slope * 0.02;
    
    // Accumulate water in basins (low points)
    float accumulation = isBasin * 0.05;
    
    // Combine all effects - much more conservative drain
    float newWater = prevWaterLevel + accumulation - drain * 0.01;
    
    // Mix with advected water (flow effect)
    newWater = mix(newWater, advectedWater * 0.8 + prevWaterLevel * 0.2, 0.5);
    
    // Clamp water level
    newWater = clamp(newWater, 0.0, 2.0);
    
    // Output the new water level
    gl_FragColor = vec4(newWater, 0.0, 0.0, 1.0);
}