/* @knip-ignore */
// D8 water surface flow simulation
import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { WaterFlowVisualization } from '../types/water-flow.js';

/**
 * Creates the fragment shader for D8 water surface flow simulation.
 * 
 * The D8 algorithm considers all 8 neighbors (cardinal + diagonal) to determine
 * the direction of steepest descent. Each cell flows entirely to its single downslope neighbor.
 * 
 * Key D8 principles:
 * 1. Calculate total height (terrain + water) for center and all 8 neighbors
 * 2. Find the neighbor with lowest total height (downslope direction)
 * 3. Calculate slope as difference between center and downslope neighbor
 * 4. Outflow is proportional to water height and slope
 * 5. Inflow is calculated by checking which neighbors flow TO this cell
 */
const getD8WaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform sampler2D waterToAdd;
        uniform float simulationSpeed;
        uniform float infiltrationRate;
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

            // Read water amount to add from the water-to-add texture
            float addAmount = texture2D(waterToAdd, uv).r;

            // Add the incoming water to current height
            float newWaterHeight = currentWaterHeight + addAmount;

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
            
            // Apply infiltration/evaporation (conservation with some loss)
            finalWaterHeight *= infiltrationRate;
            
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

    // Create initial water texture with no initial water
    const { texture: waterTexture } = createInitialWaterTexture(width);

    // Add water height variable - stores current water depth at each cell
    const waterHeightVariable = gpuCompute.addVariable(
        'waterHeight',
        getD8WaterFlowFragmentShader(),
        waterTexture
    );

    // Make variable depend on itself (for ping-pong buffering)
    gpuCompute.setVariableDependencies(waterHeightVariable, [waterHeightVariable]);

    // Create water-to-add texture for adding water via simulation
    const { texture: waterToAddTexture } = createWaterToAddTexture(width);

    // Add uniforms for terrain heightmap and simulation parameters
    waterHeightVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    waterHeightVariable.material.uniforms.waterToAdd = { value: waterToAddTexture };
    waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.15 }; // Slightly slower than 4-direction for stability
    waterHeightVariable.material.uniforms.infiltrationRate = { value: 0.98 }; // Small infiltration/evaporation
    waterHeightVariable.material.uniforms.drainageRate = { value: 0.02 }; // Small drainage
    
    const error = gpuCompute.init();
    if (error !== null) {
        console.error('D8 GPU computation initialization error:', error);
    }

    return {
        compute: () => {
            gpuCompute.compute();

            // Clear the water-to-add texture for the next frame
            const image = waterToAddTexture.image as { data: Float32Array };
            const data = image.data;
            // Set all values to 0 (zero out the water-to-add texture)
            for (let i = 0; i < data.length; i++) {
                data[i] = 0.0;
            }
            waterToAddTexture.needsUpdate = true;
        },
        getWaterTexture: () => gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
        getWaterToAddTexture: () => waterToAddTexture, // Expose the water-to-add texture for painting on click
        addWater: (x: number, y: number, amount: number, radius: number) => 
            addWater(waterHeightVariable, terrainSize, x, y, amount, radius)
    };
};

/**
 * Creates an initial water texture with no initial water covering the entire terrain.
 */
const createInitialWaterTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA
    const waterHeight = 0.0; // No initial water - click to add water where needed

    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = waterHeight; // R: water height (uniform across all texels)
        data[i * 4 + 1] = 0.0;         // G: unused
        data[i * 4 + 2] = 0.0;         // B: unused
        data[i * 4 + 3] = 1.0;         // A: alpha
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
 * Creates a water-to-add texture for adding water via the simulation shader uniform.
 * This texture is painted on click and cleared after each simulation step.
 */
const createWaterToAddTexture = (size: number): { texture: THREE.DataTexture; data: Float32Array } => {
    const data = new Float32Array(size * size * 4); // RGBA, all zeros
    
    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = 0.0; // R: water amount to add (all zeros initially)
        data[i * 4 + 1] = 0.0; // G: unused
        data[i * 4 + 2] = 0.0; // B: unused
        data[i * 4 + 3] = 1.0; // A: alpha
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    console.log('D8 water-to-add texture created:', {
        size,
        firstValue: data[0]
    });
    return { texture, data };
};

/**
 * Utility function to add water at a specific location on the terrain.
 * Paints water into the waterToAdd texture which is consumed by the simulation shader.
 * The texture is cleared after each simulation step, so water is only added for one frame.
 * 
 * @param waterHeightVariable - The water height variable from the simulation
 * @param terrainSize - Physical size of the terrain in world units
 * @param x - X coordinate in world space (0 to terrainSize)
 * @param y - Y coordinate in world space (0 to terrainSize)
 * @param amount - Amount of water to add (default: 0.5)
 * @param radius - Radius of the water circle in texels (default: 10)
 */
const addWater = (
    waterHeightVariable: any,
    terrainSize: number,
    x: number,
    y: number,
    amount: number,
    radius: number,
) => {
    // Get the water-to-add texture (DataTexture with accessible data)
    const waterToAddUniform = waterHeightVariable.material.uniforms.waterToAdd;
    const waterToAddTexture = waterToAddUniform.value as THREE.DataTexture;

    const width = waterToAddTexture.image.width;
    
    // Access the data array from the water-to-add texture
    const image = waterToAddTexture.image as { data: Float32Array };
    const data = image.data;
    
    // Convert world coordinates to UV coordinates (0 to 1)
    const uvX = x / terrainSize;
    const uvY = y / terrainSize;
    
    // Convert UV to texel coordinates (flip Y for texture coordinate system)
    const centerX = Math.floor(uvX * width);
    const centerY = Math.floor((1.0 - uvY) * width);
    
    // Calculate the radius in texels (squared for distance check)
    const radiusSq = radius * radius;
    
    // Add water in a circular pattern around the clicked location
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            // Check if within circular radius
            if (dx * dx + dy * dy <= radiusSq) {
                const texelX = centerX + dx;
                const texelY = centerY + dy;
                
                // Clamp to valid range
                if (texelX >= 0 && texelX < width && texelY >= 0 && texelY < width) {
                    // Calculate the index in the RGBA array
                    const index = (texelY * width + texelX) * 4;
                    
                    // Add water to the R channel (water amount to add)
                    data[index] = Math.min(1.0, data[index] + amount);
                }
            }
        }
    }
    
    // Mark texture as needing update
    waterToAddTexture.needsUpdate = true;
    
    console.log('D8 Water to add painted at:', { x, y, amount, centerX, centerY, radius });
};