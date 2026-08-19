import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { Animal, Position, Velocity } from "@/components/components";
import { getSurfaceMaterialTexture } from "@/renderer/systems/init/simulation";
import { logger } from "@/utils/logger";

/**
 * Animal system - makes animals move toward grass and eat it.
 * Animals will wander toward areas with grass and graze on it,
 * converting grass to bare dirt in their vicinity.
 */
export const animalSystem: SceneSystem = (world, _scene, dt): void => {
  // Get all animal entities with Position and Velocity
  const animals$ = query(world, [Animal, Position, Velocity]);

  if (animals$.length === 0) {
    return;
  }

  // Get the surface material texture to modify grass
  const surfaceMaterialTexture = getSurfaceMaterialTexture();
  if (!surfaceMaterialTexture) {
    logger.warn("[animal:system] Surface material texture not available");
    return;
  }

  // Movement parameters
  const movementSpeed = 0.5; // World units per second (slower movement)
  const grazingRadius = 0.5; // World units - smaller eating radius
  const grassDetectionRadius = 8.0; // How far animals can detect grass (larger detection area)
  const wanderSpeed = 0.3; // Speed when wandering without target (slower)

  // Terrain and texture configuration
  const terrainSize = 12; // Physical size of terrain (-6 to +6)
  const textureSize = 128; // Texture resolution
  const terrainCenter = terrainSize / 2; // 6 - half size for coordinate conversion

  for (const entity$ of animals$) {
    const x = Position.x[entity$];
    const z = Position.z[entity$];

    // Find nearest grass patch within detection radius
    let targetX = 0;
    let targetZ = 0;
    let foundGrass = false;
    let closestDistance = Infinity;

    // Search for grass in a grid pattern within detection radius
    const searchSteps = 8; // Number of points to check in each direction
    for (let i = 0; i <= searchSteps; i++) {
      const angle = (i / searchSteps) * Math.PI * 2;
      for (let distance = 0; distance <= grassDetectionRadius; distance += grassDetectionRadius / searchSteps) {
        const checkX = x + Math.cos(angle) * distance;
        const checkZ = z + Math.sin(angle) * distance;

        // Check if within terrain bounds (-terrainCenter to +terrainCenter)
        if (checkX < -terrainCenter || checkX > terrainCenter || checkZ < -terrainCenter || checkZ > terrainCenter) {
          continue;
        }

        // Convert world coordinates to texture coordinates (0 to terrainSize)
        const texX = checkX + terrainCenter;
        const texZ = checkZ + terrainCenter;

        const material = surfaceMaterialTexture.getMaterialAtPosition(texX, texZ);
        if (material === "grass") {
          const distSquared = distance * distance;
          if (distSquared < closestDistance) {
            closestDistance = distSquared;
            targetX = checkX;
            targetZ = checkZ;
            foundGrass = true;
          }
        }
      }
    }

    // Update velocity based on whether we found grass
    if (foundGrass) {
      // Move toward the grass
      const dx = targetX - x;
      const dz = targetZ - z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > 0.1) {
        // Normalize and apply speed
        const speed = movementSpeed;
        Velocity.x[entity$] = (dx / distance) * speed;
        Velocity.z[entity$] = (dz / distance) * speed;
      } else {
        // At target, stop moving
        Velocity.x[entity$] = 0;
        Velocity.z[entity$] = 0;
      }
    } else {
      // No grass found, wander slowly
      const wanderAngle = Date.now() * 0.001 + entity$;
      Velocity.x[entity$] = Math.cos(wanderAngle) * wanderSpeed;
      Velocity.z[entity$] = Math.sin(wanderAngle) * wanderSpeed;
    }

    // Apply velocity to position (with dt for frame-rate independence)
    Position.x[entity$] += Velocity.x[entity$] * dt;
    Position.z[entity$] += Velocity.z[entity$] * dt;

    // Keep animals within terrain bounds (-terrainCenter to +terrainCenter)
    Position.x[entity$] = Math.max(-terrainCenter, Math.min(terrainCenter, Position.x[entity$]));
    Position.z[entity$] = Math.max(-terrainCenter, Math.min(terrainCenter, Position.z[entity$]));

    // Convert world coordinates to texture coordinates (0 to terrainSize)
    const textureX = Position.x[entity$] + terrainCenter;
    const textureZ = Position.z[entity$] + terrainCenter;

    // Check and convert grass to bare dirt within grazing radius
    const radiusPixels = (grazingRadius / terrainSize) * textureSize;
    const radiusSquared = radiusPixels * radiusPixels;

    // Get the center pixel coordinates for efficient iteration
    const centerX = (textureX / terrainSize) * (textureSize - 1);
    const centerY = ((terrainSize - textureZ) / terrainSize) * (textureSize - 1); // Flip Y to match texture coordinates

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
          if (pixelX >= 0 && pixelX < textureSize && pixelY >= 0 && pixelY < textureSize) {
            const worldX = textureX + (px / (textureSize - 1)) * terrainSize;
            const worldZ = textureZ - (py / (textureSize - 1)) * terrainSize; // Account for Y flip

            // Check if this position has grass and convert to bare dirt
            const currentMaterial = surfaceMaterialTexture.getMaterialAtPosition(
              Math.max(0, Math.min(terrainSize, worldX)),
              Math.max(0, Math.min(terrainSize, worldZ))
            );

            if (currentMaterial === "grass") {
              // Convert grass to bare dirt with a rate factor based on dt
              // This creates gradual grazing over time
              surfaceMaterialTexture.paint(
                Math.max(0, Math.min(terrainSize, worldX)),
                Math.max(0, Math.min(terrainSize, worldZ)),
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