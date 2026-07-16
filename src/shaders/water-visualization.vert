uniform sampler2D uHeightMap;  // Initial height map for reference

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;
    
    // Pass through position for shadow calculation
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    
    // Transform normal to world space
    vNormal = normalize(normalMatrix * normal);
}