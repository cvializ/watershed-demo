import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";

const createTerrainGeometry = () => {
  // Create triangular terrain mesh
  const terrainSize = 12;
  const segments = 80;
  const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

  // Convert plane to height-based terrain
  const positions = geometry.attributes.position;

  // Calculate height for each vertex (same calculation as before)
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    // Calculate height using lower frequency noise for rolling hills
    let height = 0;
    height += calculateHeight(x, y);

    positions.setZ(i, height);
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
};

export const createTerrainResource = (scene: THREE.Scene) => {
  const geometry = createTerrainGeometry();
  const terrain = new THREE.Mesh(geometry);
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  const meshId = terrain.id;

  return {
    meshId,
  };
};
