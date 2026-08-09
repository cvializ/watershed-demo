varying vec3 vBarycentric;
varying vec2 vUv;

void main() {
    vUv = uv;
    vBarycentric = gl_BarycentricCoords;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}