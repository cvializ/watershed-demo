uniform sampler2D uHeightMap;
uniform vec2 uHeightMapSize;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;

    // Sample height from dynamic height map (includes sediment erosion/deposition)
    float height = texture2D(uHeightMap, uv).r;

    // Apply displacement along local Z (before rotation)
    vec3 displacedPosition = position + vec3(0.0, 0.0, height);

    // Compute normals from finite differences on the height map
    vec2 texelSize = 1.0 / uHeightMapSize;
    float hLeft  = texture2D(uHeightMap, uv + vec2(-texelSize.x, 0.0)).r;
    float hRight = texture2D(uHeightMap, uv + vec2(texelSize.x, 0.0)).r;
    float hDown  = texture2D(uHeightMap, uv + vec2(0.0, -texelSize.y)).r;
    float hUp    = texture2D(uHeightMap, uv + vec2(0.0, texelSize.y)).r;

    // Tangent space normals from height differences
    vec3 tangentNormal = normalize(vec3(
        hLeft - hRight,
        hDown - hUp,
        2.0 * texelSize.x
    ));

    // Transform displaced position and normal
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    vNormal = normalize((modelViewMatrix * vec4(tangentNormal, 0.0)).xyz);
}