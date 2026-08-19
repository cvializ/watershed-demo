import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { Animal, Position, Velocity } from "@/components/components";
import { getSurfaceMaterialTexture } from "@/renderer/systems/init/simulation";
import { logger } from "@/utils/logger";

// Animal movement state tracking
const animalMovementState = new Map<number, {
  targetX: number;
  targetZ: number;
  timeAtTarget: number;
  wanderAngle: number;
}>();

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
  const maxTimeAtTarget = 2.0; // Seconds before animal moves on from current location
  const stopThreshold = 0.5; // Distance threshold for "reached target"
  const minTargetDistance = 0.3; // Minimum distance to consider as a valid target (prevents targeting current position)

  // Terrain and texture configuration
  const terrainSize = 12; // Physical size of terrain (-6 to +6)
  const textureSize = 128; // Texture resolution
  const terrainCenter = terrainSize / 2; // 6 - half size for coordinate conversion

  for (const entity$ of animals$) {
    const x = Position.x[entity$];
    const z = Position.z[entity$];

    // Initialize movement state for this animal if needed
    if (!animalMovementState.has(entity$)) {
      animalMovementState.set(entity$, {
        targetX: x,
        targetZ: z,
        timeAtTarget: 0,
        wanderAngle: Math.random() * Math.PI * 2,
      });
    }
    const state = animalMovementState.get(entity$)!;

    // Find nearest grass patch within detection radius (excluding current position)
    let targetX = 0;
    let targetZ = 0;
    let foundGrass = false;
    let closestDistance = Infinity;

    // Search for grass in a spiral pattern within detection radius
    // This gives better coverage than radial grid search
    const numRings = 5; // Number of concentric rings to check
    const pointsPerRing = 16; // Points per ring for good coverage
    
    for (let ring = 1; ring <= numRings; ring++) {
      const distance = (ring / numRings) * grassDetectionRadius;
      
      for (let i = 0; i < pointsPerRing; i++) {
        const angle = (i / pointsPerRing) * Math.PI * 2 + (ring * 0.5); // Offset each ring
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
        if (material === "grass" && distance >= minTargetDistance) {
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

      if (distance > stopThreshold) {
        // Not yet at target, move toward it
        state.timeAtTarget = 0; // Reset timer when moving
        Velocity.x[entity$] = (dx / distance) * movementSpeed;
        Velocity.z[entity$] = (dz / distance) * movementSpeed;
      } else {
        // At or near target, increment time at target
        state.timeAtTarget += dt;
        
        // If we've been at this location too long, move on
        if (state.timeAtTarget > maxTimeAtTarget) {
          // Find a new grass target or start wandering
          const newDistance = Math.sqrt((targetX - x) ** 2 + (targetZ - z) ** 2);
          if (newDistance > grazingRadius * 2) {
            // Still some grass nearby, move toward edge of grazing area
            const angle = Math.atan2(targetZ - z, targetX - x);
            Velocity.x[entity$] = Math.cos(angle) * movementSpeed;
            Velocity.z[entity$] = Math.sin(angle) * movementSpeed;
          } else {
            // No more grass nearby, start wandering
            state.wanderAngle += 0.5; // Slowly change direction
            Velocity.x[entity$] = Math.cos(state.wanderAngle) * wanderSpeed;
            Velocity.z[entity$] = Math.sin(state.wanderAngle) * wanderSpeed;
          }
        } else {
          // Still grazing, move slowly around the target area
          const wanderAngle = Date.now() * 0.2 + entity$;
          Velocity.x[entity$] = Math.cos(wanderAngle) * (movementSpeed * 0.3);
          Velocity.z[entity$] = Math.sin(wanderAngle) * (movementSpeed * 0.3);
        }
      }
    } else {
      // No grass found, wander with smooth direction changes
      state.wanderAngle += dt * 0.5; // Gradual angle change
      Velocity.x[entity$] = Math.cos(state.wanderAngle) * wanderSpeed;
      Velocity.z[entity$] = Math.sin(state.wanderAngle) * wanderSpeed;
    }

    // Debug output (uncomment to see in console)
    if (entity$ === 1) { // Only log for first animal to avoid spam
      const currentDist = foundGrass ? Math.sqrt((targetX - x) ** 2 + (targetZ - z) ** 2) : 0;
      console.log(`Animal ${entity$}: pos=(${x.toFixed(2)}, ${z.toFixed(2)}), foundGrass=${foundGrass}, dist=${currentDist.toFixed(2)}, vel=(${Velocity.x[entity$].toFixed(2)}, ${Velocity.z[entity$].toFixed(2)})`);
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