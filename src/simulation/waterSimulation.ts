import * as THREE from 'three';

/**
 * Update water simulation based on terrain height data
 * @param waterTextureData - Float32Array containing current water levels
 * @param heightMapTexture - Texture containing terrain height data
 * @param width - Width of the water texture
 * @param height - Height of the water texture
 */
export function updateWaterSimulation(
    waterTextureData: Float32Array,
    heightMapTexture: THREE.DataTexture,
    width: number,
    height: number
): void {
    // Constants for water simulation
    const WATER_DRAIN_RATE = 0.02;
    
    // Helper functions
    function textureSample(texture: THREE.DataTexture, uv: THREE.Vector2): number {
        const w = texture.image.width;
        const h = texture.image.height;
        const data = texture.image.data as Float32Array;
        
        const x = Math.floor(uv.x * (w - 1));
        const z = Math.floor(uv.y * (h - 1));
        
        const idx = z * w + x;
        return data[idx];
    }
    
    function smoothstep(min: number, max: number, value: number): number {
        const t = Math.max(0, Math.min((value - min) / (max - min), 1));
        return t * t * (3 - 2 * t);
    }
    
    // Sample terrain heights at each pixel location
    const tempData = new Float32Array(width * height);
    
    for (let z = 0; z < height; z++) {
        const zIndex = z / (height - 1);
        for (let x = 0; x < width; x++) {
            const xIndex = x / (width - 1);
            
            // Get terrain height at this position
            const sampleUV = new THREE.Vector2(xIndex, zIndex);
            const terrainHeight = textureSample(heightMapTexture, sampleUV);
            
            // Get current water level
            const idx = z * width + x;
            let waterLevel = waterTextureData[idx];
            
            // Calculate gradient (slope) at this point
            let hRight = textureSample(heightMapTexture, new THREE.Vector2(Math.min(xIndex + 0.01, 1), zIndex));
            let hDown = textureSample(heightMapTexture, new THREE.Vector2(xIndex, Math.min(zIndex + 0.01, 1)));
            
            // Drain water from high slopes
            const slope = Math.abs(hRight - terrainHeight) + Math.abs(hDown - terrainHeight);
            const elevation = smoothstep(-1.5, 1.0, terrainHeight);
            waterLevel -= elevation * slope * WATER_DRAIN_RATE;
            
            // Cap and clamp
            waterLevel = Math.max(0, Math.min(waterLevel, 2.0));
            tempData[idx] = waterLevel;
        }
    }
    
    // Update the actual water data
    for (let i = 0; i < width * height; i++) {
        waterTextureData[i] = tempData[i];
    }
}