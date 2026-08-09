uniform sampler2D uHeightMap;
uniform vec2 uHeightMapSize;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;

    // Use position as-is - geometry is already displaced by updateTerrainGeometryFromRenderTarget
    // No shader displacement needed to match wireframe overlay
    vec3 displacedPosition = position;

    // Use mesh normals (computed from actual geometry)
    vNormal = normalize(normal);

    // Transform position - no displacement applied
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}