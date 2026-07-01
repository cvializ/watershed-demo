import * as THREE from 'three';

// Import terrain generation functions
import { calculateHeight } from '../../terrain.js';

/**
 * Generate line segments for downslope arrows at each vertex
 * Returns a BufferGeometry with LineSegments containing arrow lines
 */
export function createDownslopeArrowGeometry(
    terrainGeometry: THREE.BufferGeometry,
    arrowLength: number = 0.5
): THREE.BufferGeometry {
    const positions = terrainGeometry.attributes.position;
    const count = positions.count;

    // Generate arrow lines: each vertex gets an arrow pointing downslope
    const arrowPositions: number[] = [];

    // Calculate downslope direction at each vertex
    for (let i = 0; i < count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        // Calculate gradient (direction of steepest ascent)
        const epsilon = 0.1;
        const hRight = calculateHeight(x + epsilon, y);
        const hLeft = calculateHeight(x - epsilon, y);
        const hUp = calculateHeight(x, y + epsilon);
        const hDown = calculateHeight(x, y - epsilon);

        const dx = (hRight - hLeft) / (2 * epsilon);
        const dy = (hUp - hDown) / (2 * epsilon);

        // downslope is negative gradient
        const downslopeX = -dx;
        const downslopeY = -dy;

        // Normalize and scale
        const magnitude = Math.sqrt(downslopeX * downslopeX + downslopeY * downslopeY);
        if (magnitude > 0.001) {
            const scale = arrowLength / magnitude;
            const dxScaled = downslopeX * scale;
            const dyScaled = downslopeY * scale;

            // Arrow: line from current position to point downslope
            arrowPositions.push(x, y, z);           // Start (vertex position)
            arrowPositions.push(x + dxScaled, y + dyScaled, z - arrowLength * 0.3); // End (slightly down for visual effect)
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowPositions, 3));

    return geometry;
}