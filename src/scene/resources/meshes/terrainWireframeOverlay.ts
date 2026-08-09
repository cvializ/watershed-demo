import * as THREE from "three";

import { createTerrainGeometry } from "@/scene/resources/meshes/terrain";
import { logger } from "@/utils/logger";

/**
 * Create a wireframe overlay mesh for terrain visualization.
 * This renders on top of the main terrain mesh to show triangle edges.
 * Uses Three.js built-in wireframe mode for maximum compatibility.
 * 
 * Note: For the wireframe to follow terrain contours, the mesh geometry
 * must be updated from the height map texture each frame.
 * 
 * @param geometry - Shared terrain geometry (must be same as terrain mesh)
 */
export const createTerrainWireframeOverlayMesh = (
  geometry?: THREE.BufferGeometry,
) => {
  logger.info("[terrain:wireframe-overlay]");

  // Use provided geometry or create new one (should share with terrain)
  const overlayGeometry = geometry ?? createTerrainGeometry();

  // Create wireframe material with visible triangle edges
  const material = new THREE.MeshBasicMaterial({
    color: 0xffff00, // Yellow wireframe for visibility
    wireframe: true,
    transparent: true,
    opacity: 0.3, // Semi-transparent to see terrain colors underneath
    depthWrite: false, // Prevent wireframe from occluding terrain
  });

  const mesh = new THREE.Mesh(overlayGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  
  // Set higher render order to ensure wireframe renders on top
  mesh.renderOrder = 1;

  return mesh;
};