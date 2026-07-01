uniform sampler2D uDisplacementMap;
uniform float uDisplacementScale;
uniform float uDisplacementBias;

varying vec3 vNormal;
varying vec2 vUv;

void main() {
    vUv = uv;
    
    // Get the displacement value from the texture
    float displacement = texture2D(uDisplacementMap, uv).r;
    
    // Calculate the displaced position
    vec3 newPos = position;
    newPos.y += displacement * uDisplacementScale + uDisplacementBias;
    
    vNormal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}