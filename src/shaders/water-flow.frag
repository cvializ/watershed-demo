precision highp float;

uniform sampler2D uWaterMap;      // Previous water distribution (from simulation)
uniform sampler2D uDisplacementMap;  // Terrain height map
uniform float uTime;
uniform vec2 uResolution;
uniform float uFlowSpeed;

varying vec2 vUv;

void main() {
    float eps = 1.0 / 512.0; // Texture texel size
    
    // Read current water level and terrain height
    float prevWaterLevel = texture2D(uWaterMap, vUv).r;
    float terrainHeight = texture2D(uDisplacementMap, vUv).r;
    
    // Sample neighboring heights for gradient computation (larger radius)
    float hLeft = texture2D(uDisplacementMap, vUv - vec2(eps, 0.0)).r;
    float hRight = texture2D(uDisplacementMap, vUv + vec2(eps, 0.0)).r;
    float hDown = texture2D(uDisplacementMap, vUv - vec2(0.0, eps)).r;
    float hUp = texture2D(uDisplacementMap, vUv + vec2(0.0, eps)).r;
    
    // Sample larger neighborhood for plateau handling
    float hLeft2 = texture2D(uDisplacementMap, vUv - vec2(eps * 2.0, 0.0)).r;
    float hRight2 = texture2D(uDisplacementMap, vUv + vec2(eps * 2.0, 0.0)).r;
    float hDown2 = texture2D(uDisplacementMap, vUv - vec2(0.0, eps * 2.0)).r;
    float hUp2 = texture2D(uDisplacementMap, vUv + vec2(0.0, eps * 2.0)).r;
    
    // Sample diagonals
    float hTopLeft = texture2D(uDisplacementMap, vUv + vec2(-eps, eps)).r;
    float hTopRight = texture2D(uDisplacementMap, vUv + vec2(eps, eps)).r;
    float hBotLeft = texture2D(uDisplacementMap, vUv + vec2(-eps, -eps)).r;
    float hBotRight = texture2D(uDisplacementMap, vUv + vec2(eps, -eps)).r;
    
    // Read water from all neighbors
    float waterLeft = texture2D(uWaterMap, vUv - vec2(eps, 0.0)).r;
    float waterRight = texture2D(uWaterMap, vUv + vec2(eps, 0.0)).r;
    float waterDown = texture2D(uWaterMap, vUv - vec2(0.0, eps)).r;
    float waterUp = texture2D(uWaterMap, vUv + vec2(0.0, eps)).r;
    
    // Compute terrain gradient (downhill direction)
    vec2 gradient = vec2(hRight - hLeft, hUp - hDown);
    float gradientLen = length(gradient) + 0.001;
    
    // Smooth gradient from larger neighborhood
    vec2 smoothGradient = vec2(
        (hRight - hLeft) * 0.5 + (hRight2 - hLeft2) * 0.25,
        (hUp - hDown) * 0.5 + (hUp2 - hDown2) * 0.25
    );
    float smoothLen = length(smoothGradient) + 0.001;
    
    // Downhill direction - use smooth gradient for consistency
    vec2 downhillDir = normalize(-smoothGradient);
    
    // Find the lowest neighbor in the 8-directional neighborhood
    float minNeighborHeight = hLeft;
    if (hRight < minNeighborHeight) minNeighborHeight = hRight;
    if (hDown < minNeighborHeight) minNeighborHeight = hDown;
    if (hUp < minNeighborHeight) minNeighborHeight = hUp;
    if (hTopLeft < minNeighborHeight) minNeighborHeight = hTopLeft;
    if (hTopRight < minNeighborHeight) minNeighborHeight = hTopRight;
    if (hBotLeft < minNeighborHeight) minNeighborHeight = hBotLeft;
    if (hBotRight < minNeighborHeight) minNeighborHeight = hBotRight;
    
    float heightDiff = terrainHeight - minNeighborHeight;
    
    // Calculate flow weights for each direction
    float totalWeight = 0.0;
    vec4 flowWeights = vec4(0.0);
    
    // Left neighbor
    if (hLeft <= terrainHeight) {
        float diff = terrainHeight - hLeft;
        flowWeights.r = diff + 0.05; // Minimum weight
        totalWeight += flowWeights.r;
    }
    
    // Right neighbor  
    if (hRight <= terrainHeight) {
        float diff = terrainHeight - hRight;
        flowWeights.g = diff + 0.05;
        totalWeight += flowWeights.g;
    }
    
    // Down neighbor
    if (hDown <= terrainHeight) {
        float diff = terrainHeight - hDown;
        flowWeights.b = diff + 0.05;
        totalWeight += flowWeights.b;
    }
    
    // Up neighbor
    if (hUp <= terrainHeight) {
        float diff = terrainHeight - hUp;
        flowWeights.a = diff + 0.05;
        totalWeight += flowWeights.a;
    }
    
    // Normalize weights
    if (totalWeight > 0.0) {
        flowWeights /= totalWeight;
    }
    
    // Calculate outgoing water - weighted accumulation from downhill neighbors
    float outgoingWater = 0.0;
    if (totalWeight > 0.0) {
        // Weighted combination: own water + neighbors' water
        outgoingWater = prevWaterLevel * 0.3;
        if (hLeft <= terrainHeight) outgoingWater += waterLeft * flowWeights.r * 0.7;
        if (hRight <= terrainHeight) outgoingWater += waterRight * flowWeights.g * 0.7;
        if (hDown <= terrainHeight) outgoingWater += waterDown * flowWeights.b * 0.7;
        if (hUp <= terrainHeight) outgoingWater += waterUp * flowWeights.a * 0.7;
    } else {
        // All neighbors are uphill - water stays or accumulates
        outgoingWater = prevWaterLevel;
    }
    
    // Accumulate water from uphill neighbors
    float incomingWater = 0.0;
    if (hLeft > terrainHeight) incomingWater += waterLeft * 0.25;
    if (hRight > terrainHeight) incomingWater += waterRight * 0.25;
    if (hDown > terrainHeight) incomingWater += waterDown * 0.25;
    if (hUp > terrainHeight) incomingWater += waterUp * 0.25;
    
    // Constant water source to simulate rainfall/springs
    float constantSource = 0.15; // Constant water input to maintain water level
    
    // Calculate terrain properties
    float avgSurrounding = (hLeft + hRight + hDown + hUp) * 0.25;
    float isBasin = max(0.0, avgSurrounding - terrainHeight);
    
    // Slope-based drainage factor
    float slope = length(vec2(hRight - hLeft, hUp - hDown));
    float elevationFactor = smoothstep(-1.5, 1.0, terrainHeight);
    
    // Drain water from high slopes (water runs off)
    float drain = 0.0;
    if (heightDiff > 0.01 && terrainHeight > minNeighborHeight + 0.01) {
        drain = outgoingWater * slope * 0.25;
    }
    
    // Accumulate water in basins (low points)
    float accumulation = 0.0;
    if (isBasin > 0.01 && heightDiff <= 0.0) {
        accumulation = incomingWater * 0.5;
    }
    
    // Plateau drainage - flow in the direction of smoothed gradient
    float plateauDrain = 0.0;
    if (heightDiff <= 0.01 && gradientLen < 0.05) {
        // On a true plateau with very flat terrain
        // Use the smoothed downhill direction to guide flow
        vec2 offsetUV = vUv + downhillDir * eps;
        float plateauWater = texture2D(uWaterMap, clamp(offsetUV, 0.0, 1.0)).r;
        float plateauHeight = texture2D(uDisplacementMap, clamp(offsetUV, 0.0, 1.0)).r;
        
        // Only flow if the smooth gradient direction leads downhill
        if (plateauHeight <= terrainHeight + 0.01) {
            plateauDrain = (prevWaterLevel * 0.1 + plateauWater * 0.2);
        }
    }
    
    // Combine all effects - conservation of water: new = old + incoming - outgoing
    float newWater = prevWaterLevel + accumulation - drain - plateauDrain + constantSource;
    
    // Clamp water level
    newWater = clamp(newWater, 0.0, 2.0);
    
    // Debug: Boost water levels for visibility
    newWater = clamp(newWater * 1.5, 0.0, 2.0);
    
    // Debug visualization: use a brighter color to make water more visible
    // Water color based on level (deeper = darker blue, shallower = lighter)
    vec3 deepColor = vec3(0.0, 0.25, 0.8);
    vec3 shallowColor = vec3(0.0, 0.75, 1.0);
    vec3 waterColor = mix(deepColor, shallowColor, clamp(newWater * 0.5, 0.0, 1.0));
    
    // Increased opacity for better visibility
    float baseOpacity = clamp(newWater * 1.2 + 0.1, 0.08, 0.9);
    
    // Add a subtle shimmer effect based on time
    float shimmer = sin(uTime * 2.0 + vUv.x * 10.0) * 0.1;
    float opacity = clamp(baseOpacity + shimmer, 0.05, 0.95);
    
    // Output with debug visualization
    gl_FragColor = vec4(waterColor, opacity);
}