import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { Animal, Position } from "@/components/components";
import { getSurfaceMaterialTexture } from "@/renderer/systems/init/simulation";
import { logger } from "@/utils/logger";

/**
 * Animal system - makes animals eat grass in their vicinity.
 * Anywhere on the terrain with grass and an animal will slowly become bare dirt.
 */
export const animalSystem: SceneSystem = (world, _scene, _dt): void => {
  // Get all animal entities
  const animals$ = query(world, [Animal, Position]);

  if (animals$.length === 0) {
    return;
  }

  // Get the surface material texture to modify grass
  const surfaceMaterialTexture = getSurfaceMaterialTexture();
  if (!surfaceMaterialTexture) {
    logger.warn("[animal:system] Surface material texture not available");
    return;
  }

  // Grazing parameters
  const grazingRadius = 1.5; // World units - how far the animal can reach

  for (const entity$ of animals$) {
    const x = Position.x[entity$];
    const z = Position.z[entity$];

    // Get the animal's position on the terrain surface
    // Animals are positioned at ground level, so we use their x and z coordinates
    // to determine where they're grazing on the terrain
    
    // Convert world coordinates to terrain-local coordinates (0 to terrainSize)
    const terrainSize = 12; // Match the terrain size from simulation
    const textureX = (x + terrainSize / 2);
    const textureY = (z + terrainSize / 2);

    // Check and convert grass to bare dirt within grazing radius
    const radiusPixels = (grazingRadius / terrainSize) * 128; // Assuming 128x128 texture
    const radiusSquared = radiusPixels * radiusPixels;

    // Get the center pixel coordinates for efficient iteration
    const centerX = textureX / terrainSize * (128 - 1);
    const centerY = (1.0 - textureY / terrainSize) * (128 - 1); // Flip Y to match texture coordinates

    // Iterate over pixels within the grazing radius
    const searchRadius = Math.ceil(radiusPixels);
    
    for (let py = -searchRadius; py <= searchRadius; py++) {
      for (let px = -searchRadius; px <= searchRadius; px++) {
        const dx = px;
        const dy = py;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
          const pixelX = Math.floor(centerX + px);
          const pixelY = Math.floor(centerY + py);

          // Clamp to valid texture range
          if (pixelX >= 0 && pixelX < 128 && pixelY >= 0 && pixelY < 128) {
            const worldX = textureX + (px / (128 - 1)) * terrainSize;
            const worldY = textureY - (py / (128 - 1)) * terrainSize; // Account for Y flip

            // Check if this position has grass and convert to bare dirt
            const currentMaterial = surfaceMaterialTexture.getMaterialAtPosition(
              Math.max(0, Math.min(terrainSize, worldX)),
              Math.max(0, Math.min(terrainSize, worldY))
            );

            if (currentMaterial === "grass") {
              // Convert grass to bare dirt with a rate factor based on dt
              // This creates gradual grazing over time
              surfaceMaterialTexture.paint(
                Math.max(0, Math.min(terrainSize, worldX)),
                Math.max(0, Math.min(terrainSize, worldY)),
                "bareDirt",
                0.1 // Small brush for gradual effect
              );
            }
          }
        }
      }
    }

    logger.debug(
      `[animal:system] Animal ${entity$} grazing at (${x}, ${z})`
    );
  }
};