/* @knip-ignore */
// D8 water surface flow simulation with cloud shadow support
import * as THREE from 'three';
// Import GPUComputationRenderer from Three.js addons
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { createWaterSourcesSystem } from '@/systems/createWaterSourcesSystem';
import { createWaterHeightSystem } from '@/systems/createWaterHeightSystem';
import { createCloudSystem } from '@/systems/createCloudSystem';

export type WaterFlowVisualization = {
    /**
     * Executes one step of the water flow simulation.
     * @param cloudUniforms - Optional array of cloud data for shadow deposition
     * @param cloudCount - Number of active clouds (up to 16)
     */
    compute: (deltaTime: number) => THREE.Texture;

    /**
     * Adds water at a specific location on the terrain.
     * @param x - X coordinate in world space (0 to terrainSize)
     * @param y - Y coordinate in world space (0 to terrainSize)
     * @param amount - Amount of water to add
     * @param radius - Radius of the water circle in world units
     */
    addWater: (x: number, y: number, amount: number, radius: number) => void;
    
    /**
     * Get the cloud shadow texture for use with terrain materials.
     */
    getCloudShadowTexture: () => THREE.Texture;

    /**
     * Get the velocity texture for visualization.
     */
    getVelocityTexture: () => THREE.Texture;
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

    const { cloudVariable, updateClouds, getCloudTexture } = createCloudSystem(gpuCompute, width);

    const { waterSourcesVariable, addWater, clearWater } = createWaterSourcesSystem(gpuCompute, width, heightMapTexture, terrainSize);
    const { waterHeightVariable, updateWaterHeight } = createWaterHeightSystem(gpuCompute, width, heightMapTexture, cloudVariable, waterSourcesVariable);

    // Create velocity texture with initial zero values
    const data = new Float32Array(width * width * 4);
    for (let i = 0; i < width * width; i++) {
        data[i * 4 + 0] = 0.0; // vx
        data[i * 4 + 1] = 0.0; // vy
        data[i * 4 + 2] = 0.0; // magnitude (blue channel for debugging)
        data[i * 4 + 3] = 1.0; // alpha
    }
    
    const velocityTexture = new THREE.DataTexture(data, width, width, THREE.RGBAFormat, THREE.FloatType);
    velocityTexture.needsUpdate = true;

    const waterVelocityVariable = gpuCompute.addVariable(
        'waterVelocity',
        `
#include <common>
            uniform sampler2D uHeightMap;
            uniform sampler2D uWaterHeightmap;
            uniform vec2 uTexelSize;

            void main() {
                // Get texture coordinates from GPU computation renderer
                vec2 cellSize = 1.0 / resolution.xy;
                vec2 uv = gl_FragCoord.xy * cellSize;

                // Get water height at this cell
                float h = texture2D(uWaterHeightmap, uv).r;
                
                // If no water, velocity is zero
                if (h < 0.01) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                // Compute height gradient using finite differences
                float hX = texture2D(uHeightMap, uv + vec2(uTexelSize.x, 0.0)).r -
                           texture2D(uHeightMap, uv - vec2(uTexelSize.x, 0.0)).r;
                float hY = texture2D(uHeightMap, uv + vec2(0.0, uTexelSize.y)).r -
                           texture2D(uHeightMap, uv - vec2(0.0, uTexelSize.y)).r;

                // Gradient points uphill, so negative gradient is downslope
                vec2 gradient = normalize(vec2(-hX, -hY));

                // Velocity is proportional to water height (simplified shallow water approximation)
                // and directed downslope
                float speed = h * 5.0; // Scale factor for visibility
                vec2 velocity = gradient * speed;

                // Store velocity in RGB (R=velocityX, G=velocityY, B=magnitude)
                float magnitude = length(velocity);
                gl_FragColor = vec4(velocity.x, velocity.y, magnitude * 0.5, 1.0);
            }
        `,
        velocityTexture
    );

    gpuCompute.setVariableDependencies(waterVelocityVariable, [waterHeightVariable]);
    
    // Set uniforms for velocity computation
    const texelSize = 1.0 / width;
    waterVelocityVariable.material.uniforms.uHeightMap = { value: heightMapTexture };
    waterVelocityVariable.material.uniforms.uWaterHeightmap = { value: null };
    waterVelocityVariable.material.uniforms.uTexelSize = { value: new THREE.Vector2(texelSize, texelSize) };

    const error = gpuCompute.init();
    if (error !== null) {
        console.error('D8 GPU computation initialization error:', error);
    }

    return {
        compute: (deltaTime: number) => {
            updateClouds(deltaTime);
            updateWaterHeight();

            // Update water heightmap uniform for velocity computation
            waterVelocityVariable.material.uniforms.uWaterHeightmap.value = gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture;

            gpuCompute.compute();

            clearWater();

            return gpuCompute.getCurrentRenderTarget(waterHeightVariable).texture;
        },
        addWater,
        getCloudShadowTexture: () => getCloudTexture(),
        getVelocityTexture: () => gpuCompute.getCurrentRenderTarget(waterVelocityVariable).texture,
    };
};