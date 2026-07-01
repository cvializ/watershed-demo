import * as THREE from 'three';

import displacementMapVert from '../../shaders/displacement-map.vert?raw';
import displacementMapFrag from '../../shaders/displacement-map.frag?raw';

/**
 * Create a shader material with vertex displacement using a height texture
 */
export function createDisplacementMaterial(
    displacementTexture: THREE.DataTexture,
    scale: number = 2.5,
    bias: number = -1.5
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uDisplacementMap: { value: displacementTexture },
            uDisplacementScale: { value: scale },
            uDisplacementBias: { value: bias }
        },
        vertexShader: displacementMapVert,
        fragmentShader: displacementMapFrag,
        side: THREE.DoubleSide
    });
}