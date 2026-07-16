#include <common>

uniform sampler2D uHeightMap;
uniform sampler2D uWaterHeightmap;
uniform sampler2D surfaceMaterialMap; // Surface material texture

// Material types
const float MATERIAL_BARE_DIRT = 0.0;
const float MATERIAL_GRASS = 1.0;
const float MATERIAL_ROCKS = 2.0;

// Material friction coefficients (higher = slower flow)
const float FRICTION_BARE_DIRT = 1.0;
const float FRICTION_GRASS = 1.3; // Grass slows water flow
const float FRICTION_ROCKS = 0.8; // Smooth rocks allow faster flow

// Get friction based on material
float getMaterialFriction(vec2 uv) {
    vec4 materialData = texture2D(surfaceMaterialMap, uv);
    float materialType = materialData.r;
    
    if (materialType < 0.5) {
        return FRICTION_BARE_DIRT;
    } else if (materialType < 1.5) {
        return FRICTION_GRASS;
    } else {
        return FRICTION_ROCKS;
    }
}

void main() {
    // Get texture coordinates from GPU computation renderer
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Get water height at this cell
    float h = texture2D(uWaterHeightmap, uv).r;
    
    // If no water, velocity is zero
    if (h < 0.01) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Get current terrain height
    float terrainHeight = texture2D(uHeightMap, uv).r;
    
    // Find the downslope neighbor and calculate elevation drop
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
    
    float centerTotalHeight = terrainHeight + h;
    float lowestTotal = centerTotalHeight;
    int flowDirIndex = -1;
    
    // Find the lowest neighbor (same logic as water-height.frag)
    for (int i = 0; i < 8; i++) {
        vec2 offset = directions[i] * cellSize;
        
        // Check if neighbor is within bounds
        vec2 neighborUV = uv + offset;
        
        if (neighborUV.x >= 0.0 && neighborUV.x <= 1.0 &&
            neighborUV.y >= 0.0 && neighborUV.y <= 1.0) {
            
            float neighborTerrainHeight = texture2D(uHeightMap, neighborUV).r;
            float neighborWaterHeight = texture2D(uWaterHeightmap, neighborUV).r;
            float neighborTotalHeight = neighborTerrainHeight + neighborWaterHeight;
            
            if (neighborTotalHeight < lowestTotal) {
                lowestTotal = neighborTotalHeight;
                flowDirIndex = i;
            }
        }
    }
    
    // Calculate elevation drop (potential energy available for acceleration)
    float elevationDrop = centerTotalHeight - lowestTotal;
    
    // Velocity calculation based on physics:
    // Water that has fallen further (higher elevation drop) should move faster
    // Velocity = sqrt(2 * g * elevationDrop) + pressure term
    
    float velocityMagnitude = sqrt(elevationDrop * 10.0) + (h * 2.0);
    
    // Get downslope direction from the neighbor index
    vec2 actualDownslopeDir = vec2(0.0);
    if (flowDirIndex >= 0) {
        actualDownslopeDir = directions[flowDirIndex];
    }
    
    // Normalize the downslope direction
    if (length(actualDownslopeDir) > 0.001) {
        actualDownslopeDir = normalize(actualDownslopeDir);
    }
    
    vec2 velocity = actualDownslopeDir * velocityMagnitude;

    // Apply material-based friction to velocity
    float friction = getMaterialFriction(uv);
    velocity /= friction; // Higher friction = lower velocity
    
    // Store velocity in RGB (R=velocityX, G=velocityY, B=magnitude)
    float magnitude = length(velocity);
    gl_FragColor = vec4(velocity.x, velocity.y, magnitude, 1.0);
}