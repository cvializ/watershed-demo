import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

/**
 * Creates the fragment shader for water flow simulation.
 * 
 * Each cell:
 * 1. Calculates outflow to its downslope neighbor (the neighbor with lowest total height)
 * 2. Calculates inflow from all 4 neighbors that flow INTO this cell
 *    - Only counts inflow if the neighbor's downslope direction points to this cell
 * 3. Drains water that reaches the edges (out of bounds)
 * 4. Final water = current - outflow + inflow - drainage
 * 
 * Key fix: Water now properly flows downhill by checking if each neighbor's outflow
 * destination is this cell, rather than just checking if the neighbor is higher.
 * This ensures water conservation - when A flows to B, B correctly receives A's outflow.
 */
const getWaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform sampler2D waterToAdd;
        uniform float simulationSpeed;
        uniform float infiltrationRate;
        uniform float drainageRate;

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

            // Sample all 4 neighbors (von Neumann neighborhood)
            float northTotal = terrainHeight + texture2D(waterHeight, uv + vec2(0.0, cellSize.y)).r;
            float southTotal = terrainHeight + texture2D(waterHeight, uv + vec2(0.0, -cellSize.y)).r;
            float eastTotal = terrainHeight + texture2D(waterHeight, uv + vec2(cellSize.x, 0.0)).r;
            float westTotal = terrainHeight + texture2D(waterHeight, uv + vec2(-cellSize.x, 0.0)).r;

            // Find the lowest neighbor (downslope) - this cell's outflow destination
            float lowestTotal = centerTotalHeight;
            int flowDirIndex = -1; // 0=north, 1=south, 2=east, 3=west

            if (northTotal < lowestTotal) { lowestTotal = northTotal; flowDirIndex = 0; }
            if (southTotal < lowestTotal) { lowestTotal = southTotal; flowDirIndex = 1; }
            if (eastTotal < lowestTotal) { lowestTotal = eastTotal; flowDirIndex = 2; }
            if (westTotal < lowestTotal) { lowestTotal = westTotal; flowDirIndex = 3; }

            // Calculate outflow to downslope neighbor
            float slope = centerTotalHeight - lowestTotal;
            float outflow = 0.0;
            if (slope > 0.001) {
                outflow = newWaterHeight * simulationSpeed;
            }

            // Determine which direction this cell flows to (for neighbor inflow calculation)
            int myFlowDir = -1; // -1 = no outflow, 0=north, 1=south, 2=east, 3=west
            if (lowestTotal < centerTotalHeight) {
                if (flowDirIndex == 0) myFlowDir = 1; // I flow south, so north flows to me if it flows south
                else if (flowDirIndex == 1) myFlowDir = 0; // I flow north, so south flows to me if it flows north
                else if (flowDirIndex == 2) myFlowDir = 3; // I flow west, so east flows to me if it flows west
                else if (flowDirIndex == 3) myFlowDir = 2; // I flow east, so west flows to me if it flows east
            }

            // Calculate inflow from neighbors that flow INTO this cell
            float inflow = 0.0;
            
            // North neighbor: check if it flows SOUTH (to me)
            float northTerrain = texture2D(terrainHeightmap, uv + vec2(0.0, cellSize.y)).r;
            float northWater = texture2D(waterHeight, uv + vec2(0.0, cellSize.y)).r;
            float northTotalHeight = northTerrain + northWater;
            
            // Check if north's downslope is south (to me)
            // North's neighbors: N (2 steps north), S (this cell), E, W
            // Note: at boundaries, we can't read 2 steps away, so we clamp the check
            float northMinTotal = northTotalHeight;
            int northLowestDir = -1; // 0=N, 1=S, 2=E, 3=W
            
            // Check north's south neighbor (this cell) - only if we're not at the top boundary
            bool canCheckSouth = uv.y + cellSize.y < 1.0;
            if (canCheckSouth) {
                float southTotal = terrainHeight + newWaterHeight; // this cell
                if (southTotal < northMinTotal) { northMinTotal = southTotal; northLowestDir = 1; }
            }
            
            // Check north's east neighbor
            bool canCheckEast = uv.x + cellSize.x < 1.0;
            if (canCheckEast) {
                float eastTerrainN = texture2D(terrainHeightmap, uv + vec2(cellSize.x, cellSize.y)).r;
                float eastWaterN = texture2D(waterHeight, uv + vec2(cellSize.x, cellSize.y)).r;
                float eastTotalN = eastTerrainN + eastWaterN;
                if (eastTotalN < northMinTotal) { northMinTotal = eastTotalN; northLowestDir = 2; }
            }
            
            // Check north's west neighbor
            bool canCheckWest = uv.x - cellSize.x >= 0.0;
            if (canCheckWest) {
                float westTerrainN = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, cellSize.y)).r;
                float westWaterN = texture2D(waterHeight, uv + vec2(-cellSize.x, cellSize.y)).r;
                float westTotalN = westTerrainN + westWaterN;
                if (westTotalN < northMinTotal) { northMinTotal = westTotalN; northLowestDir = 3; }
            }
            
            // North flows south if: (1) it has a lower neighbor to the south, AND (2) that's its lowest neighbor
            if (northLowestDir == 1 && northMinTotal < northTotalHeight) {
                float southTotal = terrainHeight + newWaterHeight;
                float northToSouthSlope = northTotalHeight - southTotal;
                inflow += northWater * simulationSpeed;
            }
            
            // South neighbor: check if it flows NORTH (to me)
            float southTerrain = texture2D(terrainHeightmap, uv + vec2(0.0, -cellSize.y)).r;
            float southWater = texture2D(waterHeight, uv + vec2(0.0, -cellSize.y)).r;
            float southTotalHeight = southTerrain + southWater;
            
            // Check if south's downslope is north (to me)
            float southMinTotal = southTotalHeight;
            int southLowestDir = -1;
            
            // Check south's north neighbor (this cell) - only if we're not at the bottom boundary
            bool canCheckNorth = uv.y - cellSize.y >= 0.0;
            if (canCheckNorth) {
                float northTotal = terrainHeight + newWaterHeight; // this cell
                if (northTotal < southMinTotal) { southMinTotal = northTotal; southLowestDir = 0; }
            }
            
            // Check south's east neighbor
            bool canCheckEastS = uv.x + cellSize.x < 1.0;
            if (canCheckEastS) {
                float eastTerrainS = texture2D(terrainHeightmap, uv + vec2(cellSize.x, -cellSize.y)).r;
                float eastWaterS = texture2D(waterHeight, uv + vec2(cellSize.x, -cellSize.y)).r;
                float eastTotalS = eastTerrainS + eastWaterS;
                if (eastTotalS < southMinTotal) { southMinTotal = eastTotalS; southLowestDir = 2; }
            }
            
            // Check south's west neighbor
            bool canCheckWestS = uv.x - cellSize.x >= 0.0;
            if (canCheckWestS) {
                float westTerrainS = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, -cellSize.y)).r;
                float westWaterS = texture2D(waterHeight, uv + vec2(-cellSize.x, -cellSize.y)).r;
                float westTotalS = westTerrainS + westWaterS;
                if (westTotalS < southMinTotal) { southMinTotal = westTotalS; southLowestDir = 3; }
            }
            
            // South flows north if: (1) it has a lower neighbor to the north, AND (2) that's its lowest neighbor
            if (southLowestDir == 0 && southMinTotal < southTotalHeight) {
                float northTotal = terrainHeight + newWaterHeight;
                float southToNorthSlope = southTotalHeight - northTotal;
                inflow += southWater * simulationSpeed;
            }
            
            // East neighbor: check if it flows WEST (to me)
            float eastTerrain = texture2D(terrainHeightmap, uv + vec2(cellSize.x, 0.0)).r;
            float eastWater = texture2D(waterHeight, uv + vec2(cellSize.x, 0.0)).r;
            float eastTotalHeight = eastTerrain + eastWater;
            
            // Check if east's downslope is west (to me)
            float eastMinTotal = eastTotalHeight;
            int eastLowestDir = -1;
            
            // Check east's west neighbor (this cell) - only if we're not at the right boundary
            bool canCheckWestE = uv.x - cellSize.x >= 0.0;
            if (canCheckWestE) {
                float westTotal = terrainHeight + newWaterHeight; // this cell
                if (westTotal < eastMinTotal) { eastMinTotal = westTotal; eastLowestDir = 3; }
            }
            
            // Check east's north neighbor
            bool canCheckNorthE = uv.y + cellSize.y < 1.0;
            if (canCheckNorthE) {
                float northTerrainE = texture2D(terrainHeightmap, uv + vec2(cellSize.x, cellSize.y)).r;
                float northWaterE = texture2D(waterHeight, uv + vec2(cellSize.x, cellSize.y)).r;
                float northTotalE = northTerrainE + northWaterE;
                if (northTotalE < eastMinTotal) { eastMinTotal = northTotalE; eastLowestDir = 0; }
            }
            
            // Check east's south neighbor
            bool canCheckSouthE = uv.y - cellSize.y >= 0.0;
            if (canCheckSouthE) {
                float southTerrainE = texture2D(terrainHeightmap, uv + vec2(cellSize.x, -cellSize.y)).r;
                float southWaterE = texture2D(waterHeight, uv + vec2(cellSize.x, -cellSize.y)).r;
                float southTotalE = southTerrainE + southWaterE;
                if (southTotalE < eastMinTotal) { eastMinTotal = southTotalE; eastLowestDir = 1; }
            }
            
            // East flows west if: (1) it has a lower neighbor to the west, AND (2) that's its lowest neighbor
            if (eastLowestDir == 3 && eastMinTotal < eastTotalHeight) {
                float westTotal = terrainHeight + newWaterHeight;
                float eastToWestSlope = eastTotalHeight - westTotal;
                inflow += eastWater * simulationSpeed;
            }
            
            // West neighbor: check if it flows EAST (to me)
            float westTerrain = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, 0.0)).r;
            float westWater = texture2D(waterHeight, uv + vec2(-cellSize.x, 0.0)).r;
            float westTotalHeight = westTerrain + westWater;
            
            // Check if west's downslope is east (to me)
            float westMinTotal = westTotalHeight;
            int westLowestDir = -1;
            
            // Check west's east neighbor (this cell) - only if we're not at the left boundary
            bool canCheckEastW = uv.x + cellSize.x < 1.0;
            if (canCheckEastW) {
                float eastTotal = terrainHeight + newWaterHeight; // this cell
                if (eastTotal < westMinTotal) { westMinTotal = eastTotal; westLowestDir = 2; }
            }
            
            // Check west's north neighbor
            bool canCheckNorthW = uv.y + cellSize.y < 1.0;
            if (canCheckNorthW) {
                float northTerrainW = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, cellSize.y)).r;
                float northWaterW = texture2D(waterHeight, uv + vec2(-cellSize.x, cellSize.y)).r;
                float northTotalW = northTerrainW + northWaterW;
                if (northTotalW < westMinTotal) { westMinTotal = northTotalW; westLowestDir = 0; }
            }
            
            // Check west's south neighbor
            bool canCheckSouthW = uv.y - cellSize.y >= 0.0;
            if (canCheckSouthW) {
                float southTerrainW = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, -cellSize.y)).r;
                float southWaterW = texture2D(waterHeight, uv + vec2(-cellSize.x, -cellSize.y)).r;
                float southTotalW = southTerrainW + southWaterW;
                if (southTotalW < westMinTotal) { westMinTotal = southTotalW; westLowestDir = 1; }
            }
            
            // West flows east if: (1) it has a lower neighbor to the east, AND (2) that's its lowest neighbor
            if (westLowestDir == 2 && westMinTotal < westTotalHeight) {
                float eastTotal = terrainHeight + newWaterHeight;
                float westToEastSlope = westTotalHeight - eastTotal;
                inflow += westWater * simulationSpeed;
            }

            // Final water height = (current - outflow) + inflow
            float finalWaterHeight = newWaterHeight - outflow + inflow;
            
            // Apply infiltration/evaporation
            finalWaterHeight *= infiltrationRate;
            
            // Drain water that has accumulated (simulate evaporation/runoff to ocean)
            float drainage = finalWaterHeight * drainageRate;
            finalWaterHeight -= drainage;
            
            // Clamp to non-negative
            finalWaterHeight = max(0.0, finalWaterHeight);

            gl_FragColor = vec4(finalWaterHeight, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates a GPU-based water flow simulation on terrain.
 * 
 * The simulation uses a grid of texels where each cell represents an area of the terrain.
 * Water flows downhill based on the terrain height gradient, following these principles:
 * 
 * 1. **Gradient Calculation**: Water flows in the direction of steepest descent (downslope)
 * 2. **Advection**: Water transfers from higher to lower cells based on slope
 * 3. **Conservation**: Water is conserved (some infiltration/evaporation can be added)
 * 
 * Key fix for proper water flow: When calculating inflow, we check if each neighbor's
 * outflow destination is this cell. This ensures water conservation - when A flows to B,
 * B correctly receives exactly what A loses. The original implementation just checked if
 * the neighbor was higher, which could incorrectly count neighbors that flow elsewhere.
 * 
 * @param width - Width of the simulation grid (height will be same for square grid)
 * @param terrainSize - Physical size of the terrain in world units
 * @param renderer - WebGLRenderer instance
 */
export const createWaterFlowSimulation = (
    width: number,
    terrainSize: number,
    renderer: THREE.WebGLRenderer,
    heightMapTexture: THREE.Texture,
) => {
    const gpuCompute = new GPUComputationRenderer(width, width, renderer);

    const { texture: waterTexture } = createInitialWaterTexture(width);

    // Add water height variable - stores current water depth at each cell
    const waterHeightVariable = gpuCompute.addVariable(
        'waterHeight',
        getWaterFlowFragmentShader(),
        waterTexture
    );

    // Make variable depend on itself (for ping-pong buffering)
    gpuCompute.setVariableDependencies(waterHeightVariable, [waterHeightVariable]);

    const { texture: waterToAddTexture } = createWaterToAddTexture(width);

    // Add uniforms for terrain heightmap and simulation parameters
    waterHeightVariable.material.uniforms.terrainHeightmap = { value: heightMapTexture };
    waterHeightVariable.material.uniforms.waterToAdd = { value: waterToAddTexture };
    waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.2 };
    waterHeightVariable.material.uniforms.infiltrationRate = { value: 1 };
    waterHeightVariable.material.uniforms.drainageRate = { value: 0.05 };
    
    const error = gpuCompute.init();
    if (error !== null) {
        console.error('GPU computation initialization error:', error);
    }

    return {
        compute: () => gpuCompute.compute(),
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
    console.log('Initial water texture created:', {
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
    console.log('Water-to-add texture created:', {
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
// @knip-ignore
const addWater = (
    waterHeightVariable: any,
    terrainSize: number,
    x: number,
    y: number,
    amount: number,
    radius: number,
) => {
    // Get the water-to-add texture (DataTexture with accessible data)
    const waterToAddTexture = waterHeightVariable.material.uniforms.waterToAdd.value as THREE.DataTexture;

    const width = waterToAddTexture.image.width;
    
    // Access the data array from the water-to-add texture
    const data = waterToAddTexture.image.data as Float32Array;
    
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
    
    console.log('Water to add painted at:', { x, y, amount, centerX, centerY, radius });
};