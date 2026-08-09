import * as THREE from "three";

/**
 * Create a wireframe material that renders terrain mesh triangles.
 * Uses Three.js built-in wireframe mode for maximum compatibility.
 */
export const createTerrainWireframeMaterialResource = ({
  heightmap,
}: {
  heightmap: THREE.Texture;
}) => {
  // Use MeshBasicMaterial with wireframe mode for compatibility
  // This renders the mesh edges directly without requiring WebGL 2.0 barycentric coords
  return new THREE.MeshBasicMaterial({
    color: 0x000000, // Black wireframe
    wireframe: true,
    transparent: true,
    opacity: 0.5, // Semi-transparent to see through
  });
};