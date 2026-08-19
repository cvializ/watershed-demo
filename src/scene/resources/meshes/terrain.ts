import * as THREE from "three";

import { calculateHeight } from "@/terrainUtils";
import { logger } from "@/utils/logger";

export const createTerrainGeometry = () => {
  logger.info("[terrain:geometry]");

  // Create triangular terrain mesh
  const terrainSize = 12;
  const segments = 80;
  const geometry = new THREE.PlaneGeometry(
    terrainSize,
    terrainSize,
    segments,
    segments,
  );

  // Convert plane to height-based terrain (flat slope)
  const positions = geometry.attributes.position;

  // Calculate height for each vertex
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    // Calculate height for each vertex on the flat slope
    let height = 0;
    height += calculateHeight(x, y);

    positions.setZ(i, height);
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
};

export const createTerrainMeshResource = (geometry?: THREE.BufferGeometry) => {
  logger.info("[terrain:resource]");

  const terrainGeometry = geometry ?? createTerrainGeometry();
  const terrain = new THREE.Mesh(terrainGeometry);
  terrain.rotation.x = -Math.PI / 2;

  // Ensure terrain renders first (lowest render order)
  terrain.renderOrder = 0;

  return terrain;
};
