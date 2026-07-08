#include <common>

uniform sampler2D terrainHeightmap;
uniform sampler2D cloudShadowMap; // Cloud shadow texture from cloud shadow computation variable
uniform sampler2D waterSourcesMap; // Water sources texture from water sources computation variable
uniform float uTerrainSize;
uniform float simulationSpeed;
uniform float drainageRate;

// Direction vectors for 8 neighbors (dx, dy)
// 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
const vec2 directions[8] = vec2[](
    vec2(0.0, 1.0),    // North
    vec2(1.0, 1.0),    // Northeast
    vec2(1.0, 0.0),    // East
    vec2(1.0, -1.0),   // Southeast
    vec2(0.0, -1.0),   // South
    vec2(-1.0, -1.0),  // Southwest
    vec2(-1.0, 0.0),   // West
    vec2(-1.0, 1.0)    // Northwest
);

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Read current water height from previous frame
    float currentWaterHeight = texture2D(waterHeight, uv).r;

    // Sample cloud shadow intensity from the pre-computed texture
    float cloudShadow = texture2D(cloudShadowMap, uv).r;
    
    // Sample water sources from the pre-computed texture
    float waterSource = texture2D(waterSourcesMap, uv).r;
    
    // Convert UV to world coordinates
    float worldX = uv.x * uTerrainSize;
    float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
    
    // Add water based on cloud shadow (slow deposition)
    float cloudDeposition = 0.0;
    if (cloudShadow > 0.001) {
        // Small amount of water added per frame where cloud shadows fall
        // This simulates condensation from cooling air under clouds
        cloudDeposition = cloudShadow * 0.005; // Deposition rate
    }

    // Add water sources from the pre-computed texture (already computed on GPU)
    float sourceAmount = waterSource;

    // Add all water sources to current height
    float newWaterHeight = currentWaterHeight + cloudDeposition + sourceAmount;

    // Read terrain height at this cell
    float terrainHeight = texture2D(terrainHeightmap, uv).r;
    float centerTotalHeight = terrainHeight + newWaterHeight;

    // Find the lowest neighbor (downslope) among all 8 neighbors
    float lowestTotal = centerTotalHeight;
    int flowDirIndex = -1; // -1 means no outflow (flat or no lower neighbor)

    for (int i = 0; i < 8; i++) {
        vec2 offset = directions[i] * cellSize;
        
        // Check if neighbor is within bounds
        vec2 neighborUV = uv + offset;
        
        // Only check if within valid UV range (0 to 1)
        if (neighborUV.x >= 0.0 && neighborUV.x <= 1.0 &&
            neighborUV.y >= 0.0 && neighborUV.y <= 1.0) {
            
            float neighborTerrainHeight = texture2D(terrainHeightmap, neighborUV).r;
            float neighborWaterHeight = texture2D(waterHeight, neighborUV).r;
            float neighborTotalHeight = neighborTerrainHeight + neighborWaterHeight;
            
            if (neighborTotalHeight < lowestTotal) {
                lowestTotal = neighborTotalHeight;
                flowDirIndex = i;
            }
        }
    }

    // Calculate outflow to downslope neighbor
    float slope = centerTotalHeight - lowestTotal;
    float outflow = 0.0;
    
    if (slope > 0.001 && flowDirIndex != -1) {
        // Outflow is proportional to water height and slope
        // Using a simple linear relationship for stability
        outflow = newWaterHeight * simulationSpeed;
        
        // Cap outflow to prevent negative water
        if (outflow > newWaterHeight) {
            outflow = newWaterHeight;
        }
    }

    // Calculate inflow from neighbors that flow INTO this cell
    float inflow = 0.0;
    
    // Check all 8 neighbors to see if they flow to this cell
    for (int i = 0; i < 8; i++) {
        // The neighbor at direction i flows to us if its downslope direction is opposite of i
        // Opposite directions: N(0)<->S(4), NE(1)<->SW(5), E(2)<->W(6), SE(3)<->NW(7)
        int oppositeDir;
        if (i < 4) {
            oppositeDir = i + 4;
        } else {
            oppositeDir = i - 4;
        }
        
        vec2 offset = directions[i] * cellSize;
        vec2 neighborUV = uv + offset;
        
        // Only check if within valid UV range
        if (neighborUV.x >= 0.0 && neighborUV.x <= 1.0 &&
            neighborUV.y >= 0.0 && neighborUV.y <= 1.0) {
            
            // Get the neighbor's total height
            float neighborTerrainHeight = texture2D(terrainHeightmap, neighborUV).r;
            float neighborWaterHeight = texture2D(waterHeight, neighborUV).r;
            float neighborTotalHeight = neighborTerrainHeight + neighborWaterHeight;
            
            // Find the neighbor's downslope direction
            float neighborLowestTotal = neighborTotalHeight;
            int neighborFlowDirIndex = -1;
            
            for (int j = 0; j < 8; j++) {
                vec2 neighborOffset = directions[j] * cellSize;
                vec2 neighborOfNeighborUV = neighborUV + neighborOffset;
                
                if (neighborOfNeighborUV.x >= 0.0 && neighborOfNeighborUV.x <= 1.0 &&
                    neighborOfNeighborUV.y >= 0.0 && neighborOfNeighborUV.y <= 1.0) {
                    
                    float n2TerrainHeight = texture2D(terrainHeightmap, neighborOfNeighborUV).r;
                    float n2WaterHeight = texture2D(waterHeight, neighborOfNeighborUV).r;
                    float n2TotalHeight = n2TerrainHeight + n2WaterHeight;
                    
                    if (n2TotalHeight < neighborLowestTotal) {
                        neighborLowestTotal = n2TotalHeight;
                        neighborFlowDirIndex = j;
                    }
                }
            }
            
            // If neighbor's downslope direction matches the opposite of our direction,
            // then this neighbor flows to us
            if (neighborFlowDirIndex == oppositeDir && neighborLowestTotal < neighborTotalHeight) {
                // Calculate how much this neighbor flows out
                float neighborSlope = neighborTotalHeight - neighborLowestTotal;
                if (neighborSlope > 0.001) {
                    float neighborOutflow = neighborWaterHeight * simulationSpeed;
                    if (neighborOutflow > neighborWaterHeight) {
                        neighborOutflow = neighborWaterHeight;
                    }
                    inflow += neighborOutflow;
                }
            }
        }
    }

    // Final water height = (current - outflow) + inflow
    float finalWaterHeight = newWaterHeight - outflow + inflow;
    
    // Drain water that has accumulated (simulate evaporation/runoff)
    float drainage = finalWaterHeight * drainageRate;
    finalWaterHeight -= drainage;
    
    // Clamp to non-negative
    finalWaterHeight = max(0.0, finalWaterHeight);

    gl_FragColor = vec4(finalWaterHeight, 0.0, 0.0, 1.0);
}