import * as THREE from 'three';

// Import shader source files
import heightVisualizationVert from './shaders/height-visualization.vert?raw';
import heightVisualizationFrag from './shaders/height-visualization.frag?raw';
import slopeVisualizationVert from './shaders/slope-visualization.vert?raw';
import slopeVisualizationFrag from './shaders/slope-visualization.frag?raw';

/**
 * Generate terrain height data as a texture that can be used by the material
 */
export function generateHeightTexture(
    width: number, 
    height: number, 
    terrainSize: number
): THREE.DataTexture {
    const data = new Float32Array(width * height);
    
    // Simple noise function (matches the one in main.ts)
    function hash(x: number, z: number): number {
        const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    function noise(x: number, z: number): number {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const fx = x - x0;
        const fz = z - z0;

        const h1 = hash(x0, z0);
        const h2 = hash(x0 + 1, z0);
        const h3 = hash(x0, z0 + 1);
        const h4 = hash(x0 + 1, z0 + 1);

        const sx = fx * fx * (3 - 2 * fx);
        const sz = fz * fz * (3 - 2 * fz);

        const h12 = h1 * (1 - sx) + h2 * sx;
        const h34 = h3 * (1 - sx) + h4 * sx;

        return h12 * (1 - sz) + h34 * sz;
    }

    function getRiverDepth(x: number, z: number): number {
        const riverCenterX = Math.sin(z * 0.3) * 4 + x * 0.5;
        const distanceFromRiver = Math.abs(x - riverCenterX);
        
        let riverDepth = 0;
        if (distanceFromRiver < 2.5) {
            riverDepth = (2.5 - distanceFromRiver) / 2.5;
            riverDepth = Math.pow(riverDepth, 1.5);
        }
        
        return riverDepth;
    }
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Map texture coordinates to world space
            const worldX = (x / width) * terrainSize - terrainSize / 2;
            const worldZ = -(y / height) * terrainSize + terrainSize / 2;

            // Calculate height (negate worldZ to match main.ts coordinate system)
            let heightVal = 0;
            heightVal += noise(worldX * 0.5, -worldZ * 0.5) * 1.2;
            heightVal += noise(worldX * 1.0, -worldZ * 1.0) * 0.6;
            heightVal += noise(worldX * 2.0, -worldZ * 2.0) * 0.3;

            // Add river carving (negate worldZ to match main.ts)
            const riverDepth = getRiverDepth(worldX, -worldZ);
            if (riverDepth > 0.1) {
                heightVal -= riverDepth * 1.5;
            }

            data[y * width + x] = heightVal;
        }
    }

    return new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
}

/**
 * Create a shader material that visualizes terrain height using a color palette
 * This replaces vertex colors with GPU-based height-to-color mapping
 */
export function createHeightVisualizationMaterial(
    minHeight: number = -1.5,
    maxHeight: number = 2.0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: heightVisualizationVert,
        fragmentShader: heightVisualizationFrag,
        side: THREE.DoubleSide
    });
}

/**
 * Create a shader material for height-to-color conversion
 * Uses an external height map texture as input
 */
export function createHeightToColorMaterial(
    heightTexture: THREE.DataTexture,
    minHeight: number = -1.5,
    maxHeight: number = 2.0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightTexture },
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: heightVisualizationVert,
        fragmentShader: heightVisualizationFrag,
        side: THREE.DoubleSide
    });
}

/**
 * Create a shader material for slope-based visualization (normal map)
 * Colors vertices based on surface normals
 */
export function createSlopeVisualizationMaterial(
    minSlope: number = 0.0,
    maxSlope: number = 2.0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMinSlope: { value: minSlope },
            uMaxSlope: { value: maxSlope }
        },
        vertexShader: slopeVisualizationVert,
        fragmentShader: slopeVisualizationFrag,
        side: THREE.DoubleSide
    });
}

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

    // Simple noise function (matches main.ts)
    function hash(x: number, z: number): number {
        const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    function noise(x: number, z: number): number {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const fx = x - x0;
        const fz = z - z0;

        const h1 = hash(x0, z0);
        const h2 = hash(x0 + 1, z0);
        const h3 = hash(x0, z0 + 1);
        const h4 = hash(x0 + 1, z0 + 1);

        const sx = fx * fx * (3 - 2 * fx);
        const sz = fz * fz * (3 - 2 * fz);

        const h12 = h1 * (1 - sx) + h2 * sx;
        const h34 = h3 * (1 - sx) + h4 * sx;

        return h12 * (1 - sz) + h34 * sz;
    }

    function getRiverDepth(x: number, z: number): number {
        const riverCenterX = Math.sin(z * 0.3) * 4 + x * 0.5;
        const distanceFromRiver = Math.abs(x - riverCenterX);
        
        let riverDepth = 0;
        if (distanceFromRiver < 2.5) {
            riverDepth = (2.5 - distanceFromRiver) / 2.5;
            riverDepth = Math.pow(riverDepth, 1.5);
        }
        
        return riverDepth;
    }

    function calculateHeight(x: number, z: number): number {
        let h = 0;
        h += noise(x * 0.5, -z * 0.5) * 1.2;
        h += noise(x * 1.0, -z * 1.0) * 0.6;
        h += noise(x * 2.0, -z * 2.0) * 0.3;

        const riverDepth = getRiverDepth(x, -z);
        if (riverDepth > 0.1) {
            h -= riverDepth * 1.5;
        }

        return h;
    }

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

/**
 * Create a material for rendering downslope arrows
 */
export function createDownslopeArrowMaterial(): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1,
        transparent: true,
        opacity: 0.8,
    });
}