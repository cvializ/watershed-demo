import * as THREE from 'three';
import type { GPUComputationRenderer, Variable } from 'three/examples/jsm/Addons.js';

/**
 * Creates the fragment shader for computing water sources.
 * 
 * This shader renders water source points to a texture using the GPUComputationRenderer.
 * Each water source is represented as a soft-edged circular amount based on its position,
 * radius, and amount. The result is a texture where each pixel contains the total
 * water source amount at that world position.
 */
const getWaterSourcesFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform vec4 uWaterSourcePoints[16]; // Array of water source data: (x, y, radius, amount), max 16 sources
        uniform int uWaterSourceCount;       // Number of active water sources
        uniform float uTerrainSize;

        /**
         * Calculate water source amount at a specific world position.
         */
        float calculateWaterSource(vec2 point, vec4 source) {
            // Distance from point to source center
            float dx = point.x - source.x;
            float dy = point.y - source.y;
            float distSq = dx * dx + dy * dy;
            
            // Soft-edged circular water source
            float radiusSq = source.z * source.z;
            
            // Smooth falloff at edges using smoothstep
            if (distSq < radiusSq) {
                float t = 1.0 - distSq / radiusSq; // 1 at center, 0 at edge
                return source.w * t * t * (3.0 - 2.0 * t); // Smoothstep with amount
            }
            
            return 0.0;
        }

        /**
         * Calculate total water source from all sources at a position.
         */
        float getTotalWaterSource(vec2 point) {
            float totalSource = 0.0;
            
            for (int i = 0; i < 16; i++) {
                if (i >= uWaterSourceCount) break;
                
                float source = calculateWaterSource(point, uWaterSourcePoints[i]);
                totalSource += source; // Additive sources
            }
            
            return totalSource;
        }

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Convert UV to world coordinates
            float worldX = uv.x * uTerrainSize;
            float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
            vec2 worldPos = vec2(worldX, worldY);
            
            // Calculate total water source amount
            float waterSource = getTotalWaterSource(worldPos);
            
            // Output: R=water source amount, GBA unused
            gl_FragColor = vec4(waterSource, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates an initial water sources texture with no water sources (all zeros).
 */
const createInitialWaterSourcesTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    const initialSourceAmount = 0.0; // No water sources initially

    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = initialSourceAmount; // R: water source amount
        data[i * 4 + 1] = 0.0;                 // G: unused
        data[i * 4 + 2] = 0.0;                 // B: unused
        data[i * 4 + 3] = 1.0;                 // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    console.log('Initial water sources texture created:', {
        size,
        firstValue: data[0],
        lastValue: data[data.length - 4]
    });
    return { texture, data };
};

export const createWaterSourcesSystem = (
    gpuCompute: GPUComputationRenderer,
    width: number,
    heightMapTexture: THREE.Texture,
    terrainSize: number
) => {
    const { texture: waterSourcesTexture } = createInitialWaterSourcesTexture(width);
    const waterSourcesVariable = gpuCompute.addVariable(
        'waterSources',
        getWaterSourcesFragmentShader(),
        waterSourcesTexture
    );
    gpuCompute.setVariableDependencies(waterSourcesVariable, [waterSourcesVariable]);
    waterSourcesVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    waterSourcesVariable.material.uniforms.uTerrainSize = { value: terrainSize };
    waterSourcesVariable.material.uniforms.uWaterSourceCount = { value: 0 };
    // Add water sources uniforms (array of vec4: x, y, radius, amount)
    const waterSourceUniforms: THREE.Vector4[] = [];
    for (let i = 0; i < 16; i++) {
        waterSourceUniforms.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
    }
    waterSourcesVariable.material.uniforms.uWaterSourcePoints = { value: waterSourceUniforms };

    return {
        waterSourcesVariable,
        addWater: (x: number, y: number, amount: number, radius: number) => {
            addWater(waterSourcesVariable, x, y, amount, radius);
        },
        clearWater: () => {
            // Clear water sources for next frame (they've been consumed by the simulation)
            const sourceArray = waterSourcesVariable.material.uniforms.uWaterSourcePoints.value;
            for (let i = 0; i < sourceArray.length; i++) {
                sourceArray[i].set(0.0, 0.0, 0.0, 0.0);
            }
            waterSourcesVariable.material.uniforms.uWaterSourceCount.value = 0;
        }
    }
}

/**
 * Utility function to add water at a specific location on the terrain.
 * Sets a uniform with the source point coordinates which the water sources shader uses to add water.
 * The uniform is cleared after each simulation step (water sources are consumed).
 * 
 * @param waterSourcesVariable - The water sources variable from the simulation
 * @param x - X coordinate in world space (0 to terrainSize)
 * @param y - Y coordinate in world space (0 to terrainSize)
 * @param amount - Amount of water to add
 * @param radius - Radius of the water circle in world units
 */
const addWater = (
    waterSourcesVariable: Variable,
    x: number,
    y: number,
    amount: number,
    radius: number,
) => {
    // Set the water source point uniform
    const sourcesUniform = waterSourcesVariable.material.uniforms.uWaterSourcePoints;
    const countUniform = waterSourcesVariable.material.uniforms.uWaterSourceCount;

    // Add water source to the first available slot
    const currentCount = countUniform.value;
    if (currentCount < 16) {
        sourcesUniform.value[currentCount].set(x, y, radius, amount);
        countUniform.value = currentCount + 1;
        console.log('Water source added:', { x, y, radius, amount, count: countUniform.value });
    } else {
        console.warn('Maximum water sources (16) reached, ignoring additional source');
    }
};