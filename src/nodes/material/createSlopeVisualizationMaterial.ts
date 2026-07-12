import * as THREE from "three";

import slopeVisualizationFrag from "@/shaders/slope-visualization.frag?raw";
import slopeVisualizationVert from "@/shaders/slope-visualization.vert?raw";

/**
 * Create a shader material for slope-based visualization (normal map)
 * Colors vertices based on surface normals
 */
export function createSlopeVisualizationMaterial(
  minSlope: number = 0.0,
  maxSlope: number = 2.0,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMinSlope: { value: minSlope },
      uMaxSlope: { value: maxSlope },
    },
    vertexShader: slopeVisualizationVert,
    fragmentShader: slopeVisualizationFrag,
    side: THREE.DoubleSide,
  });
}
