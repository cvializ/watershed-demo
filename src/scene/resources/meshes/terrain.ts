import * as THREE from "three";

import { TERRAIN_SIZE } from "@/terrain/constants";
import { calculateHeight } from "@/terrainUtils";
import { logger } from "@/utils/logger";

/**
 * Grid subdivisions for the terrain plane.
 *
 * Keep the previous vertex budget (160 segments); the world is wider, so
 * per-unit density drops but per-frame rebuilds (height-map sampling plus
 * `computeVertexNormals`) stay affordable.
 */
export const TERRAIN_MESH_SEGMENTS = 160;

export const createTerrainGeometry = () => {
  logger.info("[terrain:geometry]");

  // Create triangular terrain mesh. The world spans -20..+20 on each axis so
  // terrain fills the view from any camera angle; the DEM itself covers only
  // -6..+6, and heights clamp to the DEM edge beyond that, reading as a
  // broad plain surrounding the real valley.
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_MESH_SEGMENTS,
    TERRAIN_MESH_SEGMENTS,
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

  // Enable shadow receiving on terrain
  terrain.receiveShadow = true;

  // Ensure terrain renders first (lowest render order)
  terrain.renderOrder = 0;

  return terrain;
};
