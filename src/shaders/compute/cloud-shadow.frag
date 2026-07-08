uniform sampler2D terrainHeightmap;
uniform vec4 uClouds[16];
uniform int uCloudCount;
uniform float uTerrainSize;

float calculateCloudShadow(vec2 point, vec4 cloud) {
    float dx = point.x - cloud.x;
    float dy = point.y - cloud.y;
    float distSq = dx * dx + dy * dy;
    
    if (distSq < cloud.z * cloud.z) {
        float t = 1.0 - distSq / (cloud.z * cloud.z);
        return cloud.w * t * t * (3.0 - 2.0 * t);
    }
    
    return 0.0;
}

float getTotalCloudShadow(vec2 point) {
    float totalShadow = 0.0;
    
    for (int i = 0; i < 16; i++) {
        if (i >= uCloudCount) break;
        totalShadow = max(totalShadow, calculateCloudShadow(point, uClouds[i]));
    }
    
    return totalShadow;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 worldPos = vec2(uv.x * uTerrainSize, (1.0 - uv.y) * uTerrainSize);
    
    gl_FragColor = vec4(getTotalCloudShadow(worldPos), 0.0, 0.0, 1.0);
}