// Shared noise functions for terrain generation (CPU and GPU)
// This module provides the same implementations for both TypeScript and GLSL

/**
 * Simple pseudo-random noise function
 */
function hash(x: number, z: number): number {
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

/**
 * Improved noise with more octaves for detailed terrain
 */
function noise(x: number, z: number): number {
    // Simple value noise with interpolation
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;

    const h1 = hash(x0, z0);
    const h2 = hash(x0 + 1, z0);
    const h3 = hash(x0, z0 + 1);
    const h4 = hash(x0 + 1, z0 + 1);

    // Smoothstep interpolation
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);

    const h12 = h1 * (1 - sx) + h2 * sx;
    const h34 = h3 * (1 - sx) + h4 * sx;

    return h12 * (1 - sz) + h34 * sz;
}

/**
 * Generate a procedural river path using noise
 */
function getRiverDepth(x: number, z: number): number {
    // River follows a winding path through the terrain

    // Create a curved river channel
    const riverCenterX = Math.sin(z * 0.3) * 4 + x * 0.5;
    const distanceFromRiver = Math.abs(x - riverCenterX);

    // River valley depth based on proximity to center (wider at some points)
    let riverDepth = 0;
    if (distanceFromRiver < 2.5) {
        riverDepth = (2.5 - distanceFromRiver) / 2.5;
        riverDepth = Math.pow(riverDepth, 1.5); // More natural curve
    }

    return riverDepth;
}

/**
 * Calculate terrain height at a given position
 */
export function calculateHeight(x: number, z: number): number {
    let height = 0;
    height += noise(x * 0.5, -z * 0.5) * 1.2;      // Large gentle waves
    height += noise(x * 1.0, -z * 1.0) * 0.6;      // Medium undulations
    height += noise(x * 2.0, -z * 2.0) * 0.3;      // Small variations

    // Carve river valley into terrain
    const riverDepth = getRiverDepth(x, -z);
    if (riverDepth > 0.1) {
        height -= riverDepth * 1.5;
    }

    return height;
}