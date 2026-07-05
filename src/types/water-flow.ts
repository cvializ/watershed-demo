import * as THREE from 'three';

/**
 * Type definition for the water flow simulation visualization.
 */
export type WaterFlowVisualization = {
    /**
     * Executes one step of the water flow simulation.
     * @param cloudUniforms - Optional array of cloud data for shadow deposition
     * @param cloudCount - Number of active clouds (up to 16)
     */
    compute: (cloudUniforms?: THREE.Vector4[], cloudCount?: number) => void;

    /**
     * Returns the current water height texture from the GPU computation.
     */
    getWaterTexture: () => THREE.Texture;

    /**
     * Adds water at a specific location on the terrain.
     * @param x - X coordinate in world space (0 to terrainSize)
     * @param y - Y coordinate in world space (0 to terrainSize)
     * @param amount - Amount of water to add
     * @param radius - Radius of the water circle in world units
     */
    addWater: (x: number, y: number, amount: number, radius: number) => void;
};