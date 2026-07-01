import * as THREE from 'three';

/**
 * Generate line segments for downslope arrows at each vertex
 * Returns a BufferGeometry with LineSegments containing arrow lines
 * 
 * This version uses the terrain geometry's vertex normals to determine downslope direction,
 * avoiding redundant height calculations that were already performed during terrain generation.
 */
export function createDownslopeArrowGeometry(
    terrainGeometry: THREE.BufferGeometry,
    arrowLength: number = 0.5
): THREE.BufferGeometry {
    // Ensure normals are computed
    if (!terrainGeometry.attributes.normal) {
        terrainGeometry.computeVertexNormals();
    }

    const positions = terrainGeometry.attributes.position;
    const normals = terrainGeometry.attributes.normal;
    const count = positions.count;

    // Generate arrow lines: each vertex gets an arrow pointing downslope
    const arrowPositions: number[] = [];

    // Use vertex normals to determine downslope direction
    // For a heightfield z = f(x,y), the normal is (fx, fy, -1) normalized
    // The downslope direction in XY plane is (-fx, -fy)
    for (let i = 0; i < count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        // Get normal components
        const nx = normals.getX(i);
        const ny = normals.getY(i);
        const nz = normals.getZ(i);

        // For a heightfield z = f(x,y), the normal is (fx, fy, -1) normalized
        // The downslope direction (direction of steepest descent in XY plane) is the gradient (fx, fy)
        // We extract this from the normal: downslope = -nx/nz, -ny/nz (assuming nz < 0)
        // This gives us the direction a ball would roll downhill
        const eps = 0.001;
        if (Math.abs(nz) > eps) {
            // downslope direction is the projection of the gradient onto XY plane
            const downslopeX = nx / nz;
            const downslopeY = ny / nz;

            // Scale to arrow length
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
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowPositions, 3));

    return geometry;
}