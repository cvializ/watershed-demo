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
  const terrainSize = 12;

  // Try to read from render target
  try {
    const pixelData = new Float32Array(heightMapSize * heightMapSize * 4);

    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      heightMapSize,
      heightMapSize,
      pixelData as any,
    );

    // Update each vertex position from height data
    let updated = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // Map vertex position to texture coordinates (0-1 range)
      const uvX = (x + terrainSize / 2) / terrainSize;
      const uvY = (y + terrainSize / 2) / terrainSize;

      // Convert to texture pixel coordinates
      const texX = Math.floor(uvX * (heightMapSize - 1));
      const texY = Math.floor((1.0 - uvY) * (heightMapSize - 1));

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
    logger.warn(`[terrain:update] Failed to read render target: ${String(error)}`);
  }
};