uniform sampler2D uHeightMap;  // Initial height map for reference

varying vec2 vUv;

void main() {
    vUv = uv;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}