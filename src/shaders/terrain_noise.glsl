// Shared GLSL noise functions for terrain generation
// 
// This file contains the same noise implementations used in terrain.ts
// Use it to keep GPU and CPU terrain generation perfectly synchronized.
//
// To use in your shaders, copy these functions or use a build-time
// GLSL include system.

float hash(vec2 p) {
    return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

float getRiverDepth(vec2 p) {
    vec2 riverCenter = vec2(sin(p.y * 0.3) * 4.0 + p.x * 0.5, 0.0);
    float distanceFromRiver = abs(p.x - riverCenter.x);

    if (distanceFromRiver >= 2.5) return 0.0;

    float depth = (2.5 - distanceFromRiver) / 2.5;
    return pow(depth, 1.5);
}

float calculateHeight(vec2 pos) {
    float h = 0.0;
    h += noise(vec2(pos.x, -pos.y) * 0.5) * 1.2;
    h += noise(vec2(pos.x, -pos.y) * 1.0) * 0.6;
    h += noise(vec2(pos.x, -pos.y) * 2.0) * 0.3;

    float riverDepth = getRiverDepth(vec2(pos.x, -pos.y));
    if (riverDepth > 0.1) {
        h -= riverDepth * 1.5;
    }

    return h;
}