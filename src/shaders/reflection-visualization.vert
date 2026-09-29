varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition; // World position passed from fragment shader for reflection calculation

void main() {
    vUv = uv;

    // Use position as-is - geometry is already displaced by updateTerrainGeometryFromRenderTarget
    // No shader displacement needed to match wireframe overlay
    vec3 displacedPosition = position;

    // Use mesh normals (computed from actual geometry)
    vNormal = normalize(normal);

    // Calculate and pass world position for reflection calculation
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Transform position - no displacement applied
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}