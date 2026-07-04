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
    renderer: THREE.WebGLRenderer
) => {
    const gpuCompute = new GPUComputationRenderer(width, width, renderer);

    const waterTexture = createInitialWaterTexture(width);

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

    const error = gpuCompute.init();
    if (error !== null) {
        console.error('GPU computation initialization error:', error);
    }

    return {
        gpuCompute,
        waterHeightVariable,
        getWaterTexture: () => gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture
    };
};

/**
 * Creates the fragment shader for water flow simulation.
 */
const getWaterFlowFragmentShader = (): string => {
    return /* glsl */`
        #include <common>

        uniform sampler2D terrainHeightmap;
        uniform float simulationSpeed;
        uniform float infiltrationRate;

        void main() {
            vec2 cellSize = 1.0 / resolution.xy;
            vec2 uv = gl_FragCoord.xy * cellSize;

            // Read current water height
            float currentWaterHeight = texture2D(waterHeight, uv).r;

            // Read terrain height at this cell
            float terrainHeight = texture2D(terrainHeightmap, uv).r;

            // Find downslope neighbor and calculate flow
            vec4 flowContribution = vec4(0.0);

            // Sample all 8 neighbors (Moore neighborhood)
            float centerHeight = terrainHeight + currentWaterHeight;

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
            float flowAmount = min(currentWaterHeight, slopeMagnitude * simulationSpeed);

            // Transfer water to downslope neighbor
            float newWaterHeight = currentWaterHeight;
            
            if (slopeMagnitude > 0.001 && flowDirection != vec2(0.0)) {
                // Send water to downslope cell
                flowContribution = vec4(flowAmount, 0.0, 0.0, 0.0);
                
                // Retain remaining water
                newWaterHeight = currentWaterHeight - flowAmount;
            }

            // Apply infiltration/evaporation (conservation with loss)
            newWaterHeight *= infiltrationRate;

            gl_FragColor = vec4(newWaterHeight, 0.0, 0.0, 1.0);
        }
    `;
};

/**
 * Creates an initial water texture with a one-time layer of water covering the entire terrain.
 */
const createInitialWaterTexture = (size: number): THREE.DataTexture => {
    const data = new Float32Array(size * size * 4); // RGBA
    const waterHeight = 0.5; // Uniform layer of water across entire texture (increased from 0.05)

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
    return texture;
};