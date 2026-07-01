import * as THREE from 'three';

import heightVisualizationVert from '../../shaders/height-visualization.vert?raw';
import heightVisualizationFrag from '../../shaders/height-visualization.frag?raw';

/**
 * Create a shader material that visualizes terrain height using a color palette
 * This uses a pre-computed height texture instead of duplicating noise calculations
 */
export function createHeightVisualizationMaterial(
    minHeight: number = -1.5,
    maxHeight: number = 2.0,
    heightMap?: THREE.Texture
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightMap || new THREE.Texture() },
            uMinHeight: { value: minHeight },
            uMaxHeight: { value: maxHeight }
        },
        vertexShader: heightVisualizationVert,
        fragmentShader: heightVisualizationFrag,
        side: THREE.DoubleSide
    });
}