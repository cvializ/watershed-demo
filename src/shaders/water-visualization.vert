uniform sampler2D uErodedHeightmap;
uniform sampler2D uHeightMap;  // Initial height map for reference

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;
    
    // Transform normals with modelViewMatrix for rotated terrain
    vNormal = normalize((modelViewMatrix * vec4(normal, 0.0)).xyz);
    
    // Get initial and current heights
    float initialHeight = texture2D(uHeightMap, vUv).r;
    float currentHeight = texture2D(uErodedHeightmap, vUv).r;
    
    // Compute the change in height due to erosion/deposition
    float deltaHeight = currentHeight - initialHeight;
    
    // Apply displacement along the surface normal (vertical for rotated terrain)
    // The position already has initial height baked in, so we add the delta
    vec3 displacedPosition = position + vNormal * deltaHeight;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}