import * as THREE from "three";

/**
 * Creates a debug material that visualizes displacement as colors.
 * Uses the displacement map to show height variations.
 */
export function createDebugDisplacementMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    uniform sampler2D uDisplacementMap;
    uniform float uDisplacementScale;
    uniform float uDisplacementBias;
    
    varying vec3 vPosition;
    
    void main() {
      vec4 pos = modelViewMatrix * vec4(position, 1.0);
      
      // Apply displacement
      float disp = texture2D(uDisplacementMap, uv).x;
      vec3 displacedPosition = position + normal * (disp * uDisplacementScale + uDisplacementBias);
      
      gl_Position = projectionMatrix * pos;
      vPosition = displacedPosition;
    }
  `;

  const fragmentShader = `
    uniform sampler2D uDisplacementMap;
    uniform float uDisplacementScale;
    uniform float uDisplacementBias;
    
    varying vec3 vPosition;
    
    void main() {
      // Get displacement value
      float disp = texture2D(uDisplacementMap, gl_FragCoord.xy / vec2(1.0, 1.0)).x;
      float displacementValue = disp * uDisplacementScale + uDisplacementBias;
      
      // Normalize to 0-1 range for visualization
      float normalized = (displacementValue + 1.0) * 0.5;
      
      // Create a gradient based on displacement
      vec3 color = vec3(normalized);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uDisplacementMap: { value: null },
      uDisplacementScale: { value: 1.0 },
      uDisplacementBias: { value: 0.0 },
    },
    vertexShader,
    fragmentShader,
  });
}
