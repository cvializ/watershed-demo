varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;
    
    // Transform normals with modelViewMatrix for slope calculation on rotated cube
    vNormal = normalize((modelViewMatrix * vec4(normal, 0.0)).xyz);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}