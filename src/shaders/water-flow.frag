precision highp float;

uniform sampler2D uWaterMap;      // Previous water distribution (from simulation)
uniform sampler2D uDisplacementMap;  // Terrain height map
uniform float uTime;
uniform vec2 uResolution;
uniform float uFlowSpeed;

varying vec2 vUv;

void main() {
    float eps = 0.01;
    
    // Read current water level and terrain height
    float prevWaterLevel = texture2D(uWaterMap, vUv).r;
    float terrainHeight = texture2D(uDisplacementMap, vUv).r;
    
    // Sample neighboring heights for gradient computation
    float hLeft = texture2D(uDisplacementMap, vUv - vec2(eps, 0.0)).r;
    float hRight = texture2D(uDisplacementMap, vUv + vec2(eps, 0.0)).r;
    float hDown = texture2D(uDisplacementMap, vUv - vec2(0.0, eps)).r;
    float hUp = texture2D(uDisplacementMap, vUv + vec2(0.0, eps)).r;
    
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
    float advectedWater = upstreamWater * 0.85;
    
    // Drain water from high slopes (water runs off)
    float drain = elevationFactor * slope * 0.15;
    
    // Accumulate water in basins (low points)
    float accumulation = isBasin * 0.1;
    
    // Combine all effects
    float newWater = prevWaterLevel + accumulation - drain * 0.1;
    
    // Mix with advected water (flow effect)
    newWater = mix(newWater, advectedWater * 0.5 + prevWaterLevel * 0.3, 0.6);
    
    // Clamp water level
    newWater = clamp(newWater, 0.0, 2.0);
    
    // Water color based on level (deeper = darker blue, shallower = lighter)
    vec3 deepColor = vec3(0.0, 0.25, 0.6);
    vec3 shallowColor = vec3(0.0, 0.0, 1.0);
    vec3 waterColor = mix(deepColor, shallowColor, clamp(newWater * 0.5, 0.0, 1.0));
    
    float opacity = clamp(newWater * 0.8, 0.05, 0.7);
    
    gl_FragColor = vec4(waterColor, opacity);
}