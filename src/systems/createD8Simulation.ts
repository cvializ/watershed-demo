/* @knip-ignore */
// D8 water surface flow simulation with cloud shadow support
import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { WaterFlowVisualization } from '../types/water-flow.js';

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
 */
const getD8WaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform sampler2D cloudShadowMap; // Cloud shadow texture from cloud shadow computation variable
        uniform vec4 uWaterDropPoint; // (x, y, radius, amount) in world coordinates, z=0 means no drop
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
            
            // Convert UV to world coordinates for drop point distance check
            float worldX = uv.x * uTerrainSize;
            float worldY = (1.0 - uv.y) * uTerrainSize; // Flip Y for terrain coords
            
            // Add water based on cloud shadow (slow deposition)
            float cloudDeposition = 0.0;
            if (cloudShadow > 0.001) {
                // Small amount of water added per frame where cloud shadows fall
                // This simulates condensation from cooling air under clouds
                cloudDeposition = cloudShadow * 0.015; // Deposition rate
            }

            // Check if this cell is within the user-added water drop radius and add water
            float userAddAmount = 0.0;
            if (uWaterDropPoint.z > 0.0) {
                // Calculate distance from drop point
                float dx = worldX - uWaterDropPoint.x;
                float dy = worldY - uWaterDropPoint.y;
                float distSq = dx * dx + dy * dy;
                
                // Add water if within radius (uWaterDropPoint.z is radius, so compare to radius squared)
                float radiusSq = uWaterDropPoint.z * uWaterDropPoint.z;
                if (distSq <= radiusSq) {
                    userAddAmount = uWaterDropPoint.w; // Use amount from uniform
                }
            }

            // Add all water sources to current height
            float newWaterHeight = currentWaterHeight + cloudDeposition + userAddAmount;

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

    // Create initial cloud shadow texture with no clouds (all zeros)
    const { texture: cloudShadowTexture } = createInitialCloudShadowTexture(width);
    
    // Create initial water texture with no initial water
    const { texture: waterTexture } = createInitialWaterTexture(width);

    // Add cloud shadow variable - computes cloud shadow intensity per pixel
    const cloudShadowVariable = gpuCompute.addVariable(
        'cloudShadow',  // Use a different name to avoid conflict
        getCloudShadowFragmentShader(),
        cloudShadowTexture
    );
    gpuCompute.setVariableDependencies(cloudShadowVariable, [cloudShadowVariable]);
    
    // Add terrain heightmap uniform to cloud shadow variable
    cloudShadowVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    cloudShadowVariable.material.uniforms.uTerrainSize = { value: terrainSize };
    
    // Add water height variable - stores current water depth at each cell
    const waterHeightVariable = gpuCompute.addVariable(
        'waterHeight',
        getD8WaterFlowFragmentShader(),
        waterTexture
    );

    // Make variable depend on itself (for ping-pong buffering) and cloud shadow
    gpuCompute.setVariableDependencies(waterHeightVariable, [cloudShadowVariable, waterHeightVariable]);

    // Add uniforms for terrain heightmap and simulation parameters
    waterHeightVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    
    // Add simulation speed and drainage rate uniforms
    waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.5 }; // Default: moderate flow speed
    waterHeightVariable.material.uniforms.drainageRate = { value: 0.01 };   // Default: slow drainage
    
    // Add cloud shadow uniforms to the cloud shadow variable
    const cloudUniforms: THREE.Vector4[] = [];
    for (let i = 0; i < 16; i++) {
        cloudUniforms.push(new THREE.Vector4(0.0, 0.0, 0.0, 0.0));
    }
    cloudShadowVariable.material.uniforms.uClouds = { value: cloudUniforms };
    cloudShadowVariable.material.uniforms.uCloudCount = { value: 0 }; // Initially no clouds

    // Add water drop point uniform AFTER init (render targets are created during init)
    waterHeightVariable.material.uniforms.uWaterDropPoint = { value: new THREE.Vector4(0.0, 0.0, 0.0, 0.0) };

    const error = gpuCompute.init();
    if (error !== null) {
        console.error('D8 GPU computation initialization error:', error);
    }

    // Set cloud shadow map uniform AFTER init (render targets are created during init)
    waterHeightVariable.material.uniforms.cloudShadowMap = { value: gpuCompute.getCurrentRenderTarget(cloudShadowVariable).texture };

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
            
            // First pass: compute cloud shadows, then water flow
            gpuCompute.compute();

            // Clear the water drop point uniform for the next frame
            const dropPointUniform = waterHeightVariable.material.uniforms.uWaterDropPoint;
            if (dropPointUniform) {
                dropPointUniform.value.set(0.0, 0.0, 0.0, 0.0);
            }
            
            // Debug: check if water texture has any non-zero values (commented out for production)
            // const debugWaterTex = gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture;
        },
        getWaterTexture: () => gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
        addWater: (x: number, y: number, amount: number, radius: number) => 
            addWater(waterHeightVariable, x, y, amount, radius)
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

/**
 * Utility function to add water at a specific location on the terrain.
 * Sets a uniform with the drop point coordinates which the shader uses to add water.
 * The uniform is cleared after each simulation step.
 * 
 * @param waterHeightVariable - The water height variable from the simulation
 * @param x - X coordinate in world space (0 to terrainSize)
 * @param y - Y coordinate in world space (0 to terrainSize)
 * @param amount - Amount of water to add
 * @param radius - Radius of the water circle in world units
 */
const addWater = (
    waterHeightVariable: any,
    x: number,
    y: number,
    amount: number,
    radius: number,
) => {
    // Set the water drop point uniform
    const dropPointUniform = waterHeightVariable.material.uniforms.uWaterDropPoint;
    if (dropPointUniform) {
        dropPointUniform.value.set(x, y, radius, amount);
        console.log('Water drop point set:', { x, y, radius, amount });
    } else {
        console.error('uWaterDropPoint uniform not found!');
    }
};