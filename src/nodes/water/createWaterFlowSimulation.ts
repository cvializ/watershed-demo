import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

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
 * @param width - Width of the simulation grid (height will be same for square grid)
 * @param terrainSize - Physical size of the terrain in world units
 * @param renderer - WebGLRenderer instance
 */
export const createWaterFlowSimulation = (
    width: number,
    terrainSize: number,
    renderer: THREE.WebGLRenderer
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

    // Add uniforms for terrain heightmap and simulation parameters
    waterHeightVariable.material.uniforms.terrainHeightmap = { value: null };
    waterHeightVariable.material.uniforms.simulationSpeed = { value: 0.1 }; // Slower simulation for visible flow
    waterHeightVariable.material.uniforms.infiltrationRate = { value: 0.999 }; // Minimal water loss per frame
    
    // Add uniform for water to add (painted on click, cleared after simulation)
    waterHeightVariable.material.uniforms.waterToAdd = { value: null };
    
    // Create a persistent texture for water to add (will be painted on click, cleared after simulation)
    const { texture: waterToAddTexture } = createWaterToAddTexture(width);

    const error = gpuCompute.init();
    if (error !== null) {
        console.error('GPU computation initialization error:', error);
    }

    return {
        gpuCompute,
        waterHeightVariable,
        getWaterTexture: () => gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture,
        waterToAddTexture, // Expose the water-to-add texture for painting on click
        addWater: (x: number, y: number, amount: number = 0.5, radius: number = 3) => 
            addWater(waterHeightVariable, terrainSize, x, y, amount, radius)
    };
};

/**
 * Creates the fragment shader for water flow simulation.
 */
const getWaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform sampler2D waterToAdd;
        uniform float simulationSpeed;
        uniform float infiltrationRate;

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Read current water height
            float currentWaterHeight = texture2D(waterHeight, uv).r;
            
            // Read water amount to add from the water-to-add texture
            float addAmount = texture2D(waterToAdd, uv).r;
            
            // Add the incoming water to current height
            float newWaterHeight = currentWaterHeight + addAmount;

            // Read terrain height at this cell
            float terrainHeight = texture2D(terrainHeightmap, uv).r;

            // Find downslope neighbor and calculate flow
            vec4 flowContribution = vec4(0.0);

            // Sample all 8 neighbors (Moore neighborhood)
            float centerHeight = terrainHeight + newWaterHeight;

            // North
            vec4 northData = texture2D(waterHeight, uv + vec2(0.0, cellSize.y));
            float northTerrain = texture2D(terrainHeightmap, uv + vec2(0.0, cellSize.y)).r;
            float northTotal = northTerrain + northData.r;
            
            // South
            vec4 southData = texture2D(waterHeight, uv + vec2(0.0, -cellSize.y));
            float southTerrain = texture2D(terrainHeightmap, uv + vec2(0.0, -cellSize.y)).r;
            float southTotal = southTerrain + southData.r;

            // East
            vec4 eastData = texture2D(waterHeight, uv + vec2(cellSize.x, 0.0));
            float eastTerrain = texture2D(terrainHeightmap, uv + vec2(cellSize.x, 0.0)).r;
            float eastTotal = eastTerrain + eastData.r;

            // West
            vec4 westData = texture2D(waterHeight, uv + vec2(-cellSize.x, 0.0));
            float westTerrain = texture2D(terrainHeightmap, uv + vec2(-cellSize.x, 0.0)).r;
            float westTotal = westTerrain + westData.r;

            // Calculate which neighbor has lowest total height (terrain + water)
            float lowestTotal = centerHeight;
            vec2 flowDirection = vec2(0.0);

            // North
            if (northTotal < lowestTotal) {
                lowestTotal = northTotal;
                flowDirection = vec2(0.0, cellSize.y);
            }
            // South
            if (southTotal < lowestTotal) {
                lowestTotal = southTotal;
                flowDirection = vec2(0.0, -cellSize.y);
            }
            // East
            if (eastTotal < lowestTotal) {
                lowestTotal = eastTotal;
                flowDirection = vec2(cellSize.x, 0.0);
            }
            // West
            if (westTotal < lowestTotal) {
                lowestTotal = westTotal;
                flowDirection = vec2(-cellSize.x, 0.0);
            }

            // Calculate slope magnitude
            float slopeMagnitude = centerHeight - lowestTotal;
            
            // Flow speed depends on slope - steeper = faster flow
            float flowAmount = min(newWaterHeight, slopeMagnitude * simulationSpeed);

            // Transfer water to downslope neighbor
            float finalWaterHeight = newWaterHeight;
            
            if (slopeMagnitude > 0.001 && flowDirection != vec2(0.0)) {
                // Send water to downslope cell
                flowContribution = vec4(flowAmount, 0.0, 0.0, 0.0);
                
                // Retain remaining water
                finalWaterHeight = newWaterHeight - flowAmount;
            }

            // Apply infiltration/evaporation (conservation with loss)
            finalWaterHeight *= infiltrationRate;

            gl_FragColor = vec4(finalWaterHeight, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates an initial water texture with a one-time layer of water covering the entire terrain.
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
 * @param radius - Radius of the water circle in texels (default: 3)
 */
// @knip-ignore
const addWater = (
    waterHeightVariable: any,
    terrainSize: number,
    x: number,
    y: number,
    amount: number = 0.5,
    radius: number = 10
) => {
    // Get the water-to-add texture (DataTexture with accessible data)
    const waterToAddTexture = waterHeightVariable.material.uniforms.waterToAdd.value as THREE.DataTexture;
    if (!waterToAddTexture) {
        console.warn('waterToAdd texture not set');
        return;
    }
    
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