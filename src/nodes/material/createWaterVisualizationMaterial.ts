import * as THREE from 'three';

import waterVisualizationVert from '@/shaders/water-visualization.vert?raw';
import waterVisualizationFrag from '@/shaders/water-visualization.frag?raw';

/**
 * Create a shader material that visualizes water flowing on terrain
 * The water heightmap should be updated via GPU computation simulation
 */
export function createWaterVisualizationMaterial(
    minHeight: number = -1.5,
    maxHeight: number = 2.0,
    heightMap?: THREE.Texture,
    waterHeightMap?: THREE.Texture,
    cloudShadowMap?: THREE.Texture
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightMap || new THREE.Texture() },
            uWaterHeightmap: { value: waterHeightMap || new THREE.Texture() },
            uCloudShadowMap: { value: cloudShadowMap || new THREE.Texture() },
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: waterVisualizationVert,
        fragmentShader: waterVisualizationFrag,
        side: THREE.DoubleSide
    });
}