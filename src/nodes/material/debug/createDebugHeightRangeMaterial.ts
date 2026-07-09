import * as THREE from 'three';

/**
 * Creates a debug material that visualizes height ranges with colors.
 * Different height ranges are shown with different colors.
 */
export function createDebugHeightRangeMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    varying float vPositionY;
    
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vPositionY = worldPosition.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uMinY;
    uniform float uMaxY;
    
    varying float vPositionY;
    
    void main() {
      // Normalize Y position to 0-1
      float heightRatio = (vPositionY - uMinY) / (uMaxY - uMinY);
      heightRatio = clamp(heightRatio, 0.0, 1.0);
      
      // Create a color gradient based on height
      // Low: blue, Mid: green, High: white/snow
      vec3 color;
      
      if (heightRatio < 0.3) {
        // Water/low areas - blue
        color = vec3(0.1, 0.4, 0.8);
      } else if (heightRatio < 0.6) {
        // Ground/medium - green
        color = vec3(0.2, 0.6, 0.3);
      } else if (heightRatio < 0.85) {
        // High ground - brown
        color = vec3(0.5, 0.4, 0.2);
      } else {
        // Snow peaks - white
        color = vec3(0.9, 0.9, 1.0);
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uMinY: { value: -10.0 },
      uMaxY: { value: 10.0 }
    },
    vertexShader,
    fragmentShader
  });
}