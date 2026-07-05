import * as THREE from 'three';

/**
 * Type definition for the water flow simulation visualization.
 */
export type WaterFlowVisualization = {
    /**
     * Executes one step of the water flow simulation.
     */
    compute: () => void;

    /**
     * Returns the current water height texture from the GPU computation.
     */
    getWaterTexture: () => THREE.Texture;

    /**
     * Returns the water-to-add texture for painting water on click.
     */
    getWaterToAddTexture: () => THREE.Texture;

    /**
     * Adds water at a specific location on the terrain.
     * @param x - X coordinate in world space (0 to terrainSize)
     * @param y - Y coordinate in world space (0 to terrainSize)
     * @param amount - Amount of water to add
     * @param radius - Radius of the water circle in texels
     */
    addWater: (x: number, y: number, amount: number, radius: number) => void;
};