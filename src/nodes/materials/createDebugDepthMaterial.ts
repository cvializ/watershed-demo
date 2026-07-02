import * as THREE from 'three';

/**
 * Creates a debug material that visualizes depth as colors.
 * Closer objects are darker, farther objects are brighter.
 */
export function createDebugDepthMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uNear;
    uniform float uFar;
    
    void main() {
      float depth = gl_FragCoord.z / gl_FragCoord.w;
      float near = uNear;
      float far = uFar;
      
      // Linearize depth
      float linearDepth = (2.0 * near) / (far + near - depth * (far - near));
      
      // Invert so closer is brighter
      float brightness = 1.0 - linearDepth;
      
      gl_FragColor = vec4(vec3(brightness), 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: 0.1 },
      uFar: { value: 100.0 }
    },
    vertexShader,
    fragmentShader
  });
}