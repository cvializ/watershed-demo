/* @knip-ignore */
// D8 water surface flow simulation with cloud shadow support
import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { createWaterSourcesSystem } from './createWaterSourcesSystem';

export type WaterFlowVisualization = {
    /**
     * Executes one step of the water flow simulation.
     * @param cloudUniforms - Optional array of cloud data for shadow deposition
     * @param cloudCount - Number of active clouds (up to 16)
     */
    compute: (cloudUniforms?: THREE.Vector4[], cloudCount?: number) => THREE.Texture;

    /**
     * Adds water at a specific location on the terrain.
     * @param x - X coordinate in world space (0 to terrainSize)
     * @param y - Y coordinate in world space (0 to terrainSize)
     * @param amount - Amount of water to add
     * @param radius - Radius of the water circle in world units
     */
    addWater: (x: number, y: number, amount: number, radius: number) => void;
};

/**
 * Creates the fragment shader for computing cloud shadow intensity.
 * 
 * This shader renders cloud shadows to a texture using the GPUComputationRenderer.
 * Each cloud is represented as a soft-edged circular shadow based on its position,
 * size, and intensity. The result is a texture where each pixel contains the total
 * cloud shadow intensity (0.0 to 1.0) at that world position.
 */
const getCloudShadowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform vec4 uClouds[16]; // Array of cloud data: (x, y, size, intensity), max 16 clouds
        uniform int uCloudCount;  // Number of active clouds
        uniform float uTerrainSize;

        /**
         * Calculate cloud shadow intensity at a specific world position.
         */
        float calculateCloudShadow(vec2 point, vec4 cloud) {
            // Distance from point to cloud center
            float dx = point.x - cloud.x;
            float dy = point.y - cloud.y;
            float distSq = dx * dx + dy * dy;
            
            // Soft-edged circular cloud shadow
            float radiusSq = cloud.z * cloud.z;
            
            // Smooth falloff at edges using smoothstep
            if (distSq < radiusSq) {
                float t = 1.0 - distSq / radiusSq; // 1 at center, 0 at edge
                return cloud.w * t * t * (3.0 - 2.0 * t); // Smoothstep with intensity
            }
            
            return 0.0;
        }

        /**
         * Calculate total cloud shadow from all clouds at a position.
         */
        float getTotalCloudShadow(vec2 point) {
            float totalShadow = 0.0;
            
            for (int i = 0; i < 16; i++) {
                if (i >= uCloudCount) break;
                
                float shadow = calculateCloudShadow(point, uClouds[i]);
                totalShadow = max(totalShadow, shadow); // Use maximum (not additive)
            }
            
            return totalShadow;
        }

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Convert UV to world coordinates
            float worldX = uv.x * uTerrainSize;
            float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
            vec2 worldPos = vec2(worldX, worldY);
            
            // Calculate total cloud shadow intensity
            float cloudShadow = getTotalCloudShadow(worldPos);
            
            // Output: R=cloud shadow intensity, GBA unused
            gl_FragColor = vec4(cloudShadow, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates the fragment shader for D8 water surface flow simulation.
 * 
 * The D8 algorithm considers all 8 neighbors (cardinal + diagonal) to determine
 * the direction of steepest descent. Each cell flows entirely to its single downslope neighbor.
 * 
 * Cloud shadow support: Cloud shadow intensity is pre-computed in a separate GPU computation
 * variable and passed as a texture uniform. Water deposition is calculated by sampling this texture.
 * 
 * Water sources support: Water source points are pre-computed in a separate GPU computation
 * variable and passed as a texture uniform. Water is added at source locations from this texture.
 * 
 * Key D8 principles:
 * 1. Calculate total height (terrain + water) for center and all 8 neighbors
 * 2. Find the neighbor with lowest total height (downslope direction)
 * 3. Calculate slope as difference between center and downslope neighbor
 * 4. Outflow is proportional to water height and slope
 * 5. Inflow is calculated by checking which neighbors flow TO this cell
 * 
 * Cloud shadow feature:
 * 6. Cloud shadow texture sampled per-pixel for deposition calculation
 * 7. Water is added proportional to cloud shadow intensity from pre-computed texture
 * 
 * Water sources feature:
 * 8. Water sources texture sampled per-pixel for additional water input
 * 9. Multiple water sources can be efficiently added and combined on GPU
 */
const getD8WaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform sampler2D cloudShadowMap; // Cloud shadow texture from cloud shadow computation variable
        uniform sampler2D waterSourcesMap; // Water sources texture from water sources computation variable
        uniform float uTerrainSize;
        uniform float simulationSpeed;
        uniform float drainageRate;

        // Direction vectors for 8 neighbors (dx, dy)
        // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
        const vec2 directions[8] = vec2[](
            vec2(0.0, 1.0),    // North
            vec2(1.0, 1.0),    // Northeast
            vec2(1.0, 0.0),    // East
            vec2(1.0, -1.0),   // Southeast
            vec2(0.0, -1.0),   // South
            vec2(-1.0, -1.0),  // Southwest
            vec2(-1.0, 0.0),   // West
            vec2(-1.0, 1.0)    // Northwest
        );

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Read current water height from previous frame
            float currentWaterHeight = texture2D(waterHeight, uv).r;

            // Sample cloud shadow intensity from the pre-computed texture
            float cloudShadow = texture2D(cloudShadowMap, uv).r;
            
            // Sample water sources from the pre-computed texture
            float waterSource = texture2D(waterSourcesMap, uv).r;
            
            // Convert UV to world coordinates
            float worldX = uv.x * uTerrainSize;
            float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
            
            // Add water based on cloud shadow (slow deposition)
            float cloudDeposition = 0.0;
            if (cloudShadow > 0.001) {
                // Small amount of water added per frame where cloud shadows fall
                // This simulates condensation from cooling air under clouds
                cloudDeposition = cloudShadow * 0.015; // Deposition rate
            }

            // Add water sources from the pre-computed texture (already computed on GPU)
            float sourceAmount = waterSource;

            // Add all water sources to current height
            float newWaterHeight = currentWaterHeight + cloudDeposition + sourceAmount;

            // Read terrain height at this cell
            float terrainHeight = texture2D(terrainHeightmap, uv).r;
            float centerTotalHeight = terrainHeight + newWaterHeight;

            // Find the lowest neighbor (downslope) among all 8 neighbors
            float lowestTotal = centerTotalHeight;
            int flowDirIndex = -1; // -1 means no outflow (flat or no lower neighbor)

            for (int i = 0; i < 8; i++) {
                vec2 offset = directions[i] * cellSize;
                
                // Check if neighbor is within bounds
                vec2 neighborUV = uv + offset;
                
                // Only check if within valid UV range (0 to 1)
                if (neighborUV.x >= 0.0 && neighborUV.x <= 1.0 &&
                    neighborUV.y >= 0.0 && neighborUV.y <= 1.0) {
                    
                    float neighborTerrainHeight = texture2D(terrainHeightmap, neighborUV).r;
                    float neighborWaterHeight = texture2D(waterHeight, neighborUV).r;
                    float neighborTotalHeight = neighborTerrainHeight + neighborWaterHeight;
                    
                    if (neighborTotalHeight < lowestTotal) {
                        lowestTotal = neighborTotalHeight;
                        flowDirIndex = i;
                    }
                }
            }

            // Calculate outflow to downslope neighbor
            float slope = centerTotalHeight - lowestTotal;
            float outflow = 0.0;
            
            if (slope > 0.001 && flowDirIndex != -1) {
                // Outflow is proportional to water height and slope
                // Using a simple linear relationship for stability
                outflow = newWaterHeight * simulationSpeed;
                
                // Cap outflow to prevent negative water
                if (outflow > newWaterHeight) {
                    outflow = newWaterHeight;
                }
            }

            // Calculate inflow from neighbors that flow INTO this cell
            float inflow = 0.0;
            
            // Check all 8 neighbors to see if they flow to this cell
            for (int i = 0; i < 8; i++) {
                // The neighbor at direction i flows to us if its downslope direction is opposite of i
                // Opposite directions: N(0)<->S(4), NE(1)<->SW(5), E(2)<->W(6), SE(3)<->NW(7)
                int oppositeDir;
                if (i < 4) {
                    oppositeDir = i + 4;
                } else {
                    oppositeDir = i - 4;
                }
                
                vec2 offset = directions[i] * cellSize;
                vec2 neighborUV = uv + offset;
                
                // Only check if within valid UV range
                if (neighborUV.x >= 0.0 && neighborUV.x <= 1.0 &&
                    neighborUV.y >= 0.0 && neighborUV.y <= 1.0) {
                    
                    // Get the neighbor's total height
                    float neighborTerrainHeight = texture2D(terrainHeightmap, neighborUV).r;
                    float neighborWaterHeight = texture2D(waterHeight, neighborUV).r;
                    float neighborTotalHeight = neighborTerrainHeight + neighborWaterHeight;
                    
                    // Find the neighbor's downslope direction
                    float neighborLowestTotal = neighborTotalHeight;
                    int neighborFlowDirIndex = -1;
                    
                    for (int j = 0; j < 8; j++) {
                        vec2 neighborOffset = directions[j] * cellSize;
                        vec2 neighborOfNeighborUV = neighborUV + neighborOffset;
                        
                        if (neighborOfNeighborUV.x >= 0.0 && neighborOfNeighborUV.x <= 1.0 &&
                            neighborOfNeighborUV.y >= 0.0 && neighborOfNeighborUV.y <= 1.0) {
                            
                            float n2TerrainHeight = texture2D(terrainHeightmap, neighborOfNeighborUV).r;
                            float n2WaterHeight = texture2D(waterHeight, neighborOfNeighborUV).r;
                            float n2TotalHeight = n2TerrainHeight + n2WaterHeight;
                            
                            if (n2TotalHeight < neighborLowestTotal) {
                                neighborLowestTotal = n2TotalHeight;
                                neighborFlowDirIndex = j;
                            }
                        }
                    }
                    
                    // If neighbor's downslope direction matches the opposite of our direction,
                    // then this neighbor flows to us
                    if (neighborFlowDirIndex == oppositeDir && neighborLowestTotal < neighborTotalHeight) {
                        // Calculate how much this neighbor flows out
                        float neighborSlope = neighborTotalHeight - neighborLowestTotal;
                        if (neighborSlope > 0.001) {
                            float neighborOutflow = neighborWaterHeight * simulationSpeed;
                            if (neighborOutflow > neighborWaterHeight) {
                                neighborOutflow = neighborWaterHeight;
                            }
                            inflow += neighborOutflow;
                        }
                    }
                }
            }

            // Final water height = (current - outflow) + inflow
            float finalWaterHeight = newWaterHeight - outflow + inflow;
            
            // Drain water that has accumulated (simulate evaporation/runoff)
            float drainage = finalWaterHeight * drainageRate;
            finalWaterHeight -= drainage;
            
            // Clamp to non-negative
            finalWaterHeight = max(0.0, finalWaterHeight);

            gl_FragColor = vec4(finalWaterHeight, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates a GPU-based D8 water surface flow simulation on terrain.
 * 
 * The D8 algorithm is a widely used method for river network generation in GIS.
 * It assigns each cell a flow direction to its single downslope neighbor among 8 neighbors
 * (4 cardinal + 4 diagonal), making it more realistic than the simpler 4-direction (von Neumann) approach.
 * 
 * Simulation principles:
 * 1. **D8 Flow Direction**: Each cell flows entirely to its single downslope neighbor
 * 2. **Gradient Calculation**: Water flows in the direction of steepest descent
 * 3. **Advection**: Water transfers from higher to lower cells based on slope
 * 4. **Conservation**: Inflow equals outflow (plus any infiltration/evaporation)
 * 
 * Cloud shadow separation:
 * - Cloud shadow computation is separated into its own GPU computation variable
 * - The water simulation samples cloud shadow intensity from a pre-computed texture
 * - This allows clean separation of concerns and potential reuse of cloud shadows
 * 
 * Water sources approach:
 * - Water source computation is separated into its own GPU computation variable
 * - The water simulation samples water sources from a pre-computed texture
 * - This allows multiple water sources to be efficiently added and combined on GPU
 * 
 * Key differences from 4-direction simulation:
 * - Considers diagonal neighbors (8 total instead of 4)
 * - More realistic flow patterns that can curve
 * - Better representation of natural watershed divides
 * 
 * @param width - Width of the simulation grid (height will be same for square grid)
 * @param terrainSize - Physical size of the terrain in world units
 * @param renderer - WebGLRenderer instance
 * @param heightMapTexture - Texture containing terrain height data
 */
export const createD8WaterFlowSimulation = (
    width: number,
    terrainSize: number,
    renderer: THREE.WebGLRenderer,
    heightMapTexture: THREE.Texture,
): WaterFlowVisualization => {
    const gpuCompute = new GPUComputationRenderer(width, width, renderer);

    const { texture: cloudShadowTexture } = createInitialCloudShadowTexture(width);
    const cloudShadowVariable = gpuCompute.addVariable(
        'cloudShadow',  // Use a different name to avoid conflict
        getCloudShadowFragmentShader(),
        cloudShadowTexture
    );
    gpuCompute.setVariableDependencies(cloudShadowVariable, [cloudShadowVariable]);
    cloudShadowVariable.material.uniforms.uTerrainSize = { value: terrainSize };
    
    const cloudUniforms: THREE.Vector4[] = [];
    for (let i = 0; i < 16; i++) {
        cloudUniforms.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
    }
    cloudShadowVariable.material.uniforms.uClouds = { value: cloudUniforms };
    cloudShadowVariable.material.uniforms.uCloudCount = { value: 0 };

    const { waterSourcesVariable, addWater } = createWaterSourcesSystem(gpuCompute, width, heightMapTexture, terrainSize);

    const { texture: waterTexture } = createInitialWaterTexture(width);
    const waterHeightVariable = gpuCompute.addVariable(
        'waterHeight',
        getD8WaterFlowFragmentShader(),
        waterTexture
    );
    gpuCompute.setVariableDependencies(waterHeightVariable, [cloudShadowVariable, waterSourcesVariable, waterHeightVariable]);
    waterHeightVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.5 }; // Default: moderate flow speed
    waterHeightVariable.material.uniforms.drainageRate = { value: 0.01 };   // Default: slow drainage
    waterHeightVariable.material.uniforms.waterSourcesMap = { value: null };
    waterHeightVariable.material.uniforms.cloudShadowMap = { value: null };

    const error = gpuCompute.init();
    if (error !== null) {
        console.error('D8 GPU computation initialization error:', error);
    }

    return {
        compute: (cloudUniforms?: THREE.Vector4[], cloudCount: number = 0) => {
            // Update cloud uniforms for cloud shadow computation
            if (cloudUniforms !== undefined) {
                const cloudArray = cloudShadowVariable.material.uniforms.uClouds.value;
                for (let i = 0; i < Math.min(cloudUniforms.length, 16); i++) {
                    cloudArray[i].copy(cloudUniforms[i]);
                }
                cloudShadowVariable.material.uniforms.uCloudCount.value = cloudCount;
            }
            
            console.log('Water source count:', waterSourcesVariable.material.uniforms.uWaterSourceCount.value);

            gpuCompute.compute();

            // Update uniforms with the results of the computation?
            waterHeightVariable.material.uniforms.cloudShadowMap = { value: gpuCompute.getCurrentRenderTarget(cloudShadowVariable).texture };
            waterHeightVariable.material.uniforms.waterSourcesMap = { value: gpuCompute.getCurrentRenderTarget(waterSourcesVariable).texture };

            // Clear water sources for next frame (they've been consumed by the simulation)
            const sourceArray = waterSourcesVariable.material.uniforms.uWaterSourcePoints.value;
            for (let i = 0; i < sourceArray.length; i++) {
                sourceArray[i].set(0.0, 0.0, 0.0, 0.0);
            }
            waterSourcesVariable.material.uniforms.uWaterSourceCount.value = 0;

            return gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture;
        },
        addWater,
    };
};

/**
 * Creates an initial cloud shadow texture with no clouds (all zeros).
 */
const createInitialCloudShadowTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    const initialCloudShadow = 0.0; // No clouds initially

    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = initialCloudShadow; // R: cloud shadow intensity
        data[i * 4 + 1] = 0.0;                // G: unused
        data[i * 4 + 2] = 0.0;                // B: unused
        data[i * 4 + 3] = 1.0;                // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    console.log('Initial cloud shadow texture created:', {
        size,
        firstValue: data[0],
        lastValue: data[data.length - 4]
    });
    return { texture, data };
};

/**
 * Creates an initial water texture with no initial water covering the entire terrain.
 */
const createInitialWaterTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    const initialWaterHeight = 0.0;

    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = initialWaterHeight; // R: water height (uniform across all texels)
        data[i * 4 + 1] = 0.0;                // G: unused
        data[i * 4 + 2] = 0.0;                // B: unused
        data[i * 4 + 3] = 1.0;                // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    console.log('Initial D8 water texture created:', {
        size,
        firstValue: data[0],
        lastValue: data[data.length - 4]
    });
    return { texture, data };
};
