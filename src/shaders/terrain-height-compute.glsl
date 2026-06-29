// Functional compute shader for terrain height visualization
// Uses a color palette approach to map heights to colors

#version 450

// Input: dispatch dimensions
layout(local_size_x = 16, local_size_y = 16, local_size_z = 1) in;

// Output texture (rgba32f)
layout(rgba32f, binding = 0) uniform writeonly image2D outputTexture;

// Height data (read from storage texture/buffer)
layout(r32f, binding = 1) uniform readonly image2D heightMap;

// Height range for color mapping
layout(push_constant) uniform TerrainConfig {
    float minHeight;
    float maxHeight;
    vec2 textureSize;
} config;

// Simple color palette function
vec3 getColorPalette(float normalizedHeight) {
    // Clamp to [0, 1]
    float h = clamp(normalizedHeight, 0.0, 1.0);
    
    // Functional color interpolation using piecewise functions
    // Blue (water) -> Green (land) -> White (snow peaks)
    
    // Low areas (water): blue to green
    float lowEnd = 0.3;
    vec3 colorLow = mix(vec3(0.0, 0.5, 1.0), vec3(0.2, 0.8, 0.3), h / lowEnd);
    
    // High areas: green to white
    float highStart = 0.7;
    vec3 colorHigh = mix(vec3(0.2, 0.8, 0.3), vec3(1.0), (h - highStart) / (1.0 - highStart));
    
    // Piecewise combination
    vec3 color = mix(colorLow, colorHigh, smoothstep(lowEnd, highStart, h));
    
    // Add some terrain texture detail using noise-like function
    float detail = fract(sin(dot(gl_GlobalInvocationID.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (detail - 0.5) * 0.1;
    
    return clamp(color, 0.0, 1.0);
}

// Linear interpolation function
float lerp(float a, float b, float t) {
    return a + t * (b - a);
}

vec2 lerp(vec2 a, vec2 b, float t) {
    return a + t * (b - a);
}

vec3 lerp(vec3 a, vec3 b, float t) {
    return a + t * (b - a);
}

// Main compute function
void main() {
    ivec2 coords = ivec2(gl_GlobalInvocationID.xy);
    
    // Check bounds
    if (coords.x >= int(config.textureSize.x) || coords.y >= int(config.textureSize.y)) {
        return;
    }
    
    // Read height from height map
    float height = imageLoad(heightMap, coords).r;
    
    // Normalize height to [0, 1] range
    float normalizedHeight = (height - config.minHeight) / (config.maxHeight - config.minHeight);
    
    // Get color from palette
    vec3 color = getColorPalette(normalizedHeight);
    
    // Write to output texture
    imageStore(outputTexture, coords, vec4(color, 1.0));
}