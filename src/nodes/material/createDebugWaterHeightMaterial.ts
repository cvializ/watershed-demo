import * as THREE from 'three';

/**
 * Creates a debug material that visualizes water height as colors.
 * Uses the water height texture to show water distribution.
 */
export function createDebugWaterHeightMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    uniform sampler2D uWaterHeightMap;
    
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D uWaterHeightMap;
    
    void main() {
      // Get water height value
      float waterHeight = texture2D(uWaterHeightMap, uv).r;
      
      // Visualize water height:
      // - No water (0.0): dark blue/black
      // - Low water: lighter blue
      // - High water: bright cyan/white
      
      // Create a gradient from dark to light blue
      vec3 lowColor = vec3(0.0, 0.0, 0.2);  // Dark blue
      vec3 highColor = vec3(0.2, 1.0, 1.0); // Bright cyan
      
      vec3 color = mix(lowColor, highColor, waterHeight);
      
      // Add alpha based on water height for transparency effect
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uWaterHeightMap: { value: null }
    },
    vertexShader,
    fragmentShader
  });
}