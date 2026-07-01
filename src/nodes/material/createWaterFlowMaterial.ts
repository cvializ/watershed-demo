import * as THREE from 'three';

import waterFlowVert from '../../shaders/water-flow.vert?raw';
import waterFlowFrag from '../../shaders/water-flow.frag?raw';

/**
 * Create a shader material for animated water flowing downhill
 * Water starts as uniform layer and drains into basins over time
 */
export function createWaterFlowMaterial(
    displacementTexture: THREE.DataTexture,
    waterInputTexture?: THREE.Texture,
    flowSpeed: number = 0.5
): {
    material: THREE.ShaderMaterial;
    waterTexture: THREE.DataTexture | null;
    width: number;
    height: number;
    updateWaterLevel: (xIndex: number, zIndex: number, newValue: number) => void;
} {
    const width = 512;
    const height = 512;
    
    let waterTexture: THREE.DataTexture | null = null;
    let waterData: Float32Array;
    
    // Create initial uniform water texture if no input texture provided
    if (!waterInputTexture) {
        waterData = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            waterData[i] = 1.0;
        }
        
        waterTexture = new THREE.DataTexture(
            waterData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        waterTexture.needsUpdate = true;
    } else {
        // Create dummy data array for updateWaterLevel function
        waterData = new Float32Array(0);
    }
    
    // Function to update individual water levels
    const updateWaterLevel = (xIndex: number, zIndex: number, newValue: number) => {
        if (waterTexture && xIndex >= 0 && xIndex < width && zIndex >= 0 && zIndex < height) {
            const idx = zIndex * width + xIndex;
            waterData[idx] = newValue;
        }
    };
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uWaterMap: { value: waterInputTexture || waterTexture! },
            uDisplacementMap: { value: displacementTexture },
            uTime: { value: 0.0 },
            uResolution: { value: new THREE.Vector2(width, height) },
            uFlowSpeed: { value: flowSpeed }
        },
        vertexShader: waterFlowVert,
        fragmentShader: waterFlowFrag,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false
    });
    
    return { material, waterTexture, width, height, updateWaterLevel };
}