varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vUv = uv;
    
    // Use pre-computed vertex normals from geometry
    // Normals are already computed in createTerrainGeometry using computeVertexNormals()
    vNormal = normalize(normal);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}