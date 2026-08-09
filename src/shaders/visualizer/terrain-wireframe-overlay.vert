uniform sampler2D uHeightMap;

varying vec2 vUv;

void main() {
    vUv = uv;
    
    // Sample height from height map for vertex displacement
    float height = texture2D(uHeightMap, uv).r;
    
    // Apply displacement along local Z (before rotation)
    vec3 displacedPosition = position + vec3(0.0, 0.0, height);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}