import * as THREE from "three";

import type { TerrainHeightEditor } from "@/gpu/waterFlowSimulation/variables/createTerrainHeightEditing";

import { getMesh, MeshEnum } from "@/scene/resources/mesh";
import { TERRAIN_HALF_SIZE } from "@/terrain/constants";
import { logger } from "@/utils/logger";

const heightMapSize = 512;

/**
 * Update terrain mesh geometry vertices by reading from GPU render target.
 * This ensures wireframe follows actual eroded terrain contours.
 *
 * The user-painted height offset (keyboard H/J brush) is added on top of each
 * sampled GPU height, so the mesh shows painted bumps that the simulation never
 * overwrites: the edit layer lives CPU-side and is re-applied every rebuild.
 * Vertex terrain coordinates use the same mapping as the paint strokes
 * (terrain coord = local plane coord offset by half the terrain size), so
 * strokes land under the cursor and stay where they were painted.
 */
export const updateTerrainGeometryFromRenderTarget = (
  renderTarget: THREE.WebGLRenderTarget,
  renderer: THREE.WebGLRenderer,
  terrainHeightEditor: TerrainHeightEditor | null = null,
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
      // GPUComputationRenderer uses bottom-left origin (y=0 at bottom)
      // PlaneGeometry UVs use bottom-left (0,0) to top-right (1,1)
      // readRenderTargetPixels reads from bottom-left origin
      // No Y flip needed - coordinates already match!
      const texX = Math.floor(uvX * heightMapSize);
      const texY = Math.floor(uvY * heightMapSize);

      // Clamp to bounds
      const clampedX = Math.max(0, Math.min(heightMapSize - 1, texX));
      const clampedY = Math.max(0, Math.min(heightMapSize - 1, texY));

      // Read height from pixel data (R channel)
      const index = clampedY * heightMapSize + clampedX;
      const heightValue = pixelData[index * 4];

      // Add the user-painted offset at this vertex. The terrain is a plane
      // rotated -PI/2 around X: world x = local x, world z = -local y, so
      // terrain coordinates (same space paint strokes use) are
      // (local x + half, -local y + half).
      const localX = positions.getX(i);
      const localY = positions.getY(i);
      const terrainEdit = terrainHeightEditor
        ? terrainHeightEditor.getEditAt(
            localX + TERRAIN_HALF_SIZE,
            -localY + TERRAIN_HALF_SIZE,
          )
        : 0;

      // Update Z position (height)
      positions.setZ(i, heightValue + terrainEdit);
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
