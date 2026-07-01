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
    
    // Compute flow direction (downhill) - steepest descent
    vec2 gradient = vec2(hRight - hLeft, hUp - hDown);
    float gradientLen = length(gradient) + 0.001;
    vec2 flowDir = normalize(gradient); // Downhill direction
    
    // Determine which neighbor is the steepest downhill cell
    float hCenter = texture2D(uHeightMap, vUv).r;
    
    // Find the lowest neighbor (where water flows TO)
    float minNeighborHeight = hLeft;
    vec2 sinkUV = vUv - vec2(eps, 0.0);
    
    if (hRight < minNeighborHeight) { minNeighborHeight = hRight; sinkUV = vUv + vec2(eps, 0.0); }
    if (hDown < minNeighborHeight) { minNeighborHeight = hDown; sinkUV = vUv - vec2(0.0, eps); }
    if (hUp < minNeighborHeight) { minNeighborHeight = hUp; sinkUV = vUv + vec2(0.0, eps); }
    
    // Calculate height difference with the lowest neighbor (positive = water flows out)
    float heightDiff = hCenter - minNeighborHeight;
    
    // Read water from all neighbors (upstream sources)
    float waterLeft = texture2D(uWaterMap, vUv - vec2(eps, 0.0)).r;
    float waterRight = texture2D(uWaterMap, vUv + vec2(eps, 0.0)).r;
    float waterDown = texture2D(uWaterMap, vUv - vec2(0.0, eps)).r;
    float waterUp = texture2D(uWaterMap, vUv + vec2(0.0, eps)).r;
    
    // Accumulate water from uphill neighbors (sources)
    float incomingWater = 0.0;
    if (hLeft > hCenter) incomingWater += waterLeft * 0.25;
    if (hRight > hCenter) incomingWater += waterRight * 0.25;
    if (hDown > hCenter) incomingWater += waterDown * 0.25;
    if (hUp > hCenter) incomingWater += waterUp * 0.25;
    
    // Calculate terrain properties
    float avgSurrounding = (hLeft + hRight + hDown + hUp) * 0.25;
    float isBasin = max(0.0, avgSurrounding - hCenter); // Positive if we're in a depression
    
    // Slope-based drainage (water flows out when we're higher than surroundings)
    float slope = gradientLen;
    float elevationFactor = smoothstep(-1.5, 1.0, hCenter);
    
    // Outgoing water - flows to the lowest neighbor
    float outgoingWater = 0.0;
    if (heightDiff > 0.01) { // Only flow if there's a significant height difference
        outgoingWater = prevWaterLevel * 0.3 + incomingWater * 0.7;
    }
    
    // Drain water from high slopes (water runs off) - based on actual slope direction
    float drain = 0.0;
    if (hCenter > minNeighborHeight + 0.01) {
        drain = outgoingWater * slope * 0.2;
    }
    
    // Accumulate water in basins (low points) - fill depressions first
    float accumulation = 0.0;
    if (isBasin > 0.01 && heightDiff <= 0.0) {
        accumulation = incomingWater * 0.3;
    }
    
    // Conservation of water: new = old + incoming - outgoing
    float newWater = prevWaterLevel + accumulation - drain;
    
    // Clamp water level
    newWater = clamp(newWater, 0.0, 2.0);
    
    // Output the new water level
    gl_FragColor = vec4(newWater, 0.0, 0.0, 1.0);
}