import * as THREE from "three";

import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { logger } from "@/utils/logger";

const heightMapSize = 512;

/**
 * Update terrain mesh geometry vertices by reading from GPU render target.
 * This ensures wireframe follows actual eroded terrain contours.
 */
export const updateTerrainGeometryFromRenderTarget = (
  renderTarget: THREE.WebGLRenderTarget,
  renderer: THREE.WebGLRenderer,
) => {
  const terrainMesh = getMesh(MeshEnum.Terrain);
  const wireframeOverlay = getMesh(MeshEnum.TerrainWireframeOverlay);

  if (!terrainMesh || !wireframeOverlay) {
    return;
  }

  const geometry = terrainMesh.geometry as THREE.BufferGeometry;
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv; // Use built-in UV attributes

  // Try to read from render target
  try {
    const pixelData = new Float32Array(heightMapSize * heightMapSize * 4);

    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      heightMapSize,
      heightMapSize,
      pixelData,
    );

    // Update each vertex position from height data
    let updated = 0;
    for (let i = 0; i < positions.count; i++) {
      // Use the geometry's UV attributes directly (0-1 range)
      const uvX = uvs.getX(i);
      const uvY = uvs.getY(i);

      // Convert to texture pixel coordinates
      // GPUComputationRenderer uses bottom-left origin, same as readRenderTargetPixels
      // PlaneGeometry UVs also use bottom-left (0,0) to top-right (1,1)
      const texX = Math.floor(uvX * heightMapSize);
      const texY = Math.floor((1.0 - uvY) * heightMapSize); // Flip Y to match texture storage

      // Clamp to bounds
      const clampedX = Math.max(0, Math.min(heightMapSize - 1, texX));
      const clampedY = Math.max(0, Math.min(heightMapSize - 1, texY));

      // Read height from pixel data (R channel)
      const index = clampedY * heightMapSize + clampedX;
      const heightValue = pixelData[index * 4];

      // Update Z position (height)
      positions.setZ(i, heightValue);
      updated++;
    }

    // Mark for update and recalculate normals
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    logger.debug(
      { updated },
      "[terrain:update] Mesh geometry updated from GPU render target",
    );
  } catch (error) {
    logger.warn(
      `[terrain:update] Failed to read render target: ${String(error)}`,
    );
  }
};
