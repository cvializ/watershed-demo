import * as THREE from 'three';

/**
 * Create a material for rendering downslope arrows
 */
export function createDownslopeArrowMaterial(): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1,
        transparent: true,
        opacity: 0.8,
    });
}