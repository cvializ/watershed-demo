import * as THREE from 'three';

import waterFlowVert from '../../shaders/water-flow.vert?raw';
import waterFlowFrag from '../../shaders/water-flow.frag?raw';

/**
 * Create a shader material for animated water flowing downhill
 * Water starts as uniform layer and drains into basins over time
 */
export function createWaterFlowMaterial(
    displacementTexture: THREE.DataTexture,
    flowSpeed: number = 0.5
): {
    material: THREE.ShaderMaterial;
    waterTexture: THREE.DataTexture;
    width: number;
    height: number;
    updateWaterLevel: (xIndex: number, zIndex: number, newValue: number) => void;
} {
    const width = 512;
    const height = 512;
    
    // Create initial uniform water texture (all ones = full water coverage)
    const waterData = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        waterData[i] = 1.0;
    }
    
    const waterTexture = new THREE.DataTexture(
        waterData,
        width,
        height,
        THREE.RedFormat,
        THREE.FloatType
    );
    waterTexture.needsUpdate = true;
    
    // Function to update individual water levels
    const updateWaterLevel = (xIndex: number, zIndex: number, newValue: number) => {
        if (xIndex >= 0 && xIndex < width && zIndex >= 0 && zIndex < height) {
            const idx = zIndex * width + xIndex;
            waterData[idx] = newValue;
        }
    };
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uWaterMap: { value: waterTexture },
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