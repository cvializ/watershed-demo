import { query } from "bitecs";

import type { SceneSystem } from "@/scene/types";

import { Animal, Position, Velocity } from "@/components/components";
import { getSurfaceMaterialTexture } from "@/renderer/systems/init/simulation";

// Animal movement state - simplified navigation approach
const animalMovementState = new Map<number, {
  wanderAngle: number;
  directionChangeTime: number;
}>();

/**
 * Animal system - makes animals move toward grass and eat it.
 * Uses a biased random walk navigation: animals wander with periodic direction changes,
 * but are pulled toward areas with grass. This prevents getting stuck while still
 * allowing them to find and graze on grass patches.
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
    return;
  }

  // Movement parameters - simplified navigation
  const movementSpeed = 0.5; // World units per second
  const grazingRadius = 0.5; // World units - eating radius
  const grassDetectionRadius = 8.0; // How far animals can detect grass
  const wanderSpeed = 0.35; // Speed when wandering
  const directionChangeInterval = 4.0; // Seconds between random direction changes
  const grassBiasStrength = 0.3; // How strongly animals are pulled toward grass (0-1)

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
        wanderAngle: Math.random() * Math.PI * 2,
        directionChangeTime: Date.now(),
      });
    }
    const state = animalMovementState.get(entity$)!;

    // Step 1: Check if there's grass nearby (within grazing radius)
    let hasGrassNearby = false;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const checkX = x + Math.cos(angle) * grazingRadius;
      const checkZ = z + Math.sin(angle) * grazingRadius;
      if (checkX >= -terrainCenter && checkX <= terrainCenter && 
          checkZ >= -terrainCenter && checkZ <= terrainCenter) {
        const texX = checkX + terrainCenter;
        const texZ = checkZ + terrainCenter;
        if (surfaceMaterialTexture.getMaterialAtPosition(texX, texZ) === "grass") {
          hasGrassNearby = true;
          break;
        }
      }
    }

    // Step 2: Calculate grass gradient (direction toward most grass)
    let grassDirectionX = 0;
    let grassDirectionZ = 0;
    
    if (!hasGrassNearby) {
      // Sample grass in multiple directions at detection radius
      const sampleCount = 8;
      for (let i = 0; i < sampleCount; i++) {
        const angle = (i / sampleCount) * Math.PI * 2;
        const checkX = x + Math.cos(angle) * grassDetectionRadius;
        const checkZ = z + Math.sin(angle) * grassDetectionRadius;
        
        if (checkX >= -terrainCenter && checkX <= terrainCenter && 
            checkZ >= -terrainCenter && checkZ <= terrainCenter) {
          // Count grass in a small area around this point
          let grassCount = 0;
          for (let j = 0; j < 4; j++) {
            const innerAngle = (j / 4) * Math.PI * 2;
            const innerX = checkX + Math.cos(innerAngle) * 1.0;
            const innerZ = checkZ + Math.sin(innerAngle) * 1.0;
            if (innerX >= -terrainCenter && innerX <= terrainCenter &&
                innerZ >= -terrainCenter && innerZ <= terrainCenter) {
              const innerTexX = innerX + terrainCenter;
              const innerTexZ = innerZ + terrainCenter;
              if (surfaceMaterialTexture.getMaterialAtPosition(innerTexX, innerTexZ) === "grass") {
                grassCount++;
              }
            }
          }
          
          // Add to gradient weighted by grass count
          grassDirectionX += Math.cos(angle) * grassCount;
          grassDirectionZ += Math.sin(angle) * grassCount;
        }
      }
    }

    // Step 3: Update wander direction periodically
    const now = Date.now();
    if (now - state.directionChangeTime > directionChangeInterval * 1000) {
      // Change to a new random direction
      state.wanderAngle = Math.random() * Math.PI * 2;
      state.directionChangeTime = now;
    }

    // Step 4: Calculate final velocity - blend wander direction with grass gradient
    const wanderDirX = Math.cos(state.wanderAngle);
    const wanderDirZ = Math.sin(state.wanderAngle);
    
    // Normalize grass direction if it has magnitude
    const grassMagnitude = Math.sqrt(grassDirectionX ** 2 + grassDirectionZ ** 2);
    let finalDirX = wanderDirX;
    let finalDirZ = wanderDirZ;
    
    if (grassMagnitude > 0) {
      const grassDirX = grassDirectionX / grassMagnitude;
      const grassDirZ = grassDirectionZ / grassMagnitude;
      
      // Blend: wander direction + biased pull toward grass
      finalDirX = wanderDirX * (1 - grassBiasStrength) + grassDirX * grassBiasStrength;
      finalDirZ = wanderDirZ * (1 - grassBiasStrength) + grassDirZ * grassBiasStrength;
      
      // Normalize the result
      const finalMagnitude = Math.sqrt(finalDirX ** 2 + finalDirZ ** 2);
      if (finalMagnitude > 0) {
        finalDirX /= finalMagnitude;
        finalDirZ /= finalMagnitude;
      }
    }

    // Apply speed based on whether we have grass nearby or not
    const currentSpeed = hasGrassNearby ? movementSpeed * 0.3 : wanderSpeed;
    Velocity.x[entity$] = finalDirX * currentSpeed;
    Velocity.z[entity$] = finalDirZ * currentSpeed;

    // Step 5: Apply velocity to position (with dt for frame-rate independence)
    Position.x[entity$] += Velocity.x[entity$] * dt;
    Position.z[entity$] += Velocity.z[entity$] * dt;

    // Keep animals within terrain bounds (-terrainCenter to +terrainCenter)
    Position.x[entity$] = Math.max(-terrainCenter, Math.min(terrainCenter, Position.x[entity$]));
    Position.z[entity$] = Math.max(-terrainCenter, Math.min(terrainCenter, Position.z[entity$]));

    // Step 6: Convert world coordinates to texture coordinates (0 to terrainSize)
    const textureX = Position.x[entity$] + terrainCenter;
    const textureZ = Position.z[entity$] + terrainCenter;

    // Step 7: Check and convert grass to bare dirt within grazing radius
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

    // Debug output - log every 5 seconds for first animal to see behavior over time
    const debugInterval = 5000; // 5 seconds
    if (entity$ === 1 && Math.abs(Date.now() % debugInterval) < 50) {
      console.log(`Animal ${entity$}: pos=(${x.toFixed(2)}, ${z.toFixed(2)}), grassNearby=${hasGrassNearby}, wanderAngle=${state.wanderAngle.toFixed(2)}, vel=(${Velocity.x[entity$].toFixed(2)}, ${Velocity.z[entity$].toFixed(2)})`);
    }
  }
};