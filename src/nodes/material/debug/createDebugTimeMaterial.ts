import * as THREE from 'three';

/**
 * Creates a debug material that visualizes time-based animation.
 * Shows how values change over time using color cycling.
 */
export function createDebugTimeMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    
    void main() {
      // Create time-based animation
      float t = uTime * 0.5;
      
      // Generate colors based on time
      float r = sin(t) * 0.5 + 0.5;
      float g = sin(t + 2.0) * 0.5 + 0.5;
      float b = sin(t + 4.0) * 0.5 + 0.5;
      
      // Add pattern based on screen position
      vec2 uv = gl_FragCoord.xy / vec2(1.0, 1.0);
      float pattern = sin(uv.x * 10.0 + t) * cos(uv.y * 10.0 + t) * 0.5 + 0.5;
      
      vec3 color = vec3(r, g, b) * pattern;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 }
    },
    vertexShader,
    fragmentShader
  });
}