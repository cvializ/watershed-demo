uniform sampler2D uDisplacementMap;
uniform float uDisplacementScale;
uniform float uDisplacementBias;

varying vec3 vNormal;
varying vec2 vUv;

void main() {
    vUv = uv;
    
    // Get the displacement value from the texture
    float displacement = texture2D(uDisplacementMap, uv).r;
    
    // For a PlaneGeometry rotated -90° on X, the local coordinates are:
    // - local X maps to world X
    // - local Y maps to world Z (depth)
    // - local Z maps to world Y (height/vertical)
    // 
    // So we displace the local Z coordinate (which becomes vertical in world space)
    vec3 newPos = position;
    newPos.z += displacement * uDisplacementScale + uDisplacementBias;
    
    vNormal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}