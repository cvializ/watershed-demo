uniform sampler2D uErodedHeightmap;
uniform sampler2D uHeightMap;  // Initial height map for reference

varying vec2 vUv;

void main() {
    vUv = uv;
    
    // Get initial and current heights
    float initialHeight = texture2D(uHeightMap, vUv).r;
    float currentHeight = texture2D(uErodedHeightmap, vUv).r;
    
    // Compute the change in height due to erosion/deposition
    float deltaHeight = currentHeight - initialHeight;
    
    // Clamp deltaHeight to prevent extreme displacement
    // Erosion should be gradual - limit to reasonable range
    deltaHeight = clamp(deltaHeight, -2.0, 2.0);
    
    // Apply vertical displacement only
    // For rotated PlaneGeometry (rotation.x = -π/2):
    // Local space: x, y are in-plane coordinates, z is the height (set during geometry creation)
    // After -π/2 X rotation: z becomes y (vertical axis in world space)
    // So we need to modify position.z which contains the height values
    vec3 displacedPosition = position;
    displacedPosition.z += deltaHeight;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}