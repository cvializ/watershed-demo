#include <common>

uniform vec4 uWaterSourcePoints[16]; // Array of water source data: (x, y, radius, amount), max 16 sources
uniform int uWaterSourceCount;       // Number of active water sources
uniform float uTerrainSize;

/**
 * Calculate water source amount at a specific world position.
 */
float calculateWaterSource(vec2 point, vec4 source) {
    // Distance from point to source center
    float dx = point.x - source.x;
    float dy = point.y - source.y;
    float distSq = dx * dx + dy * dy;
    
    // Soft-edged circular water source
    float radiusSq = source.z * source.z;
    
    // Smooth falloff at edges using smoothstep
    if (distSq < radiusSq) {
        float t = 1.0 - distSq / radiusSq; // 1 at center, 0 at edge
        return source.w * t * t * (3.0 - 2.0 * t); // Smoothstep with amount
    }
    
    return 0.0;
}

/**
 * Calculate total water source from all sources at a position.
 */
float getTotalWaterSource(vec2 point) {
    float totalSource = 0.0;
    
    for (int i = 0; i < 16; i++) {
        if (i >= uWaterSourceCount) break;
        
        float source = calculateWaterSource(point, uWaterSourcePoints[i]);
        totalSource += source; // Additive sources
    }
    
    return totalSource;
}

void main() {
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    // Convert UV to world coordinates
    float worldX = uv.x * uTerrainSize;
    float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
    vec2 worldPos = vec2(worldX, worldY);
    
    // Calculate total water source amount
    float waterSource = getTotalWaterSource(worldPos);
    
    // Output: R=water source amount, GBA unused
    gl_FragColor = vec4(waterSource, 0.0, 0.0, 1.0);
}