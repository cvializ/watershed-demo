import * as THREE from "three";

/**
 * Create a line basic material for downslope arrows visualization
 */
export const createDownslopeArrowsMaterialResource = () => {
  return new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 1,
    transparent: true,
    opacity: 0.8,
  });
};
