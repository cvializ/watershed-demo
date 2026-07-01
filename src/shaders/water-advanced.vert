/**
 * Advanced water vertex shader with height-based displacement
 */
uniform sampler2D uDisplacementMap;  // Terrain height map
uniform float uTime;

varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    
    // Get terrain height at this position
    float terrainHeight = texture2D(uDisplacementMap, uv).r;
    
    // Calculate water surface position
    // Water sits on top of terrain with slight displacement
    vec3 pos = position;
    
    // Add small wave displacement based on velocity (from simulation)
    float waveDisplacement = sin(pos.x * 5.0 + uTime * 3.0) * 
                             cos(pos.y * 5.0 + uTime * 2.0);
    pos.z = terrainHeight + waveDisplacement * 0.1;
    
    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}