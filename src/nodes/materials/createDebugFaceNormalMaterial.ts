import * as THREE from 'three';

/**
 * Creates a debug material that visualizes face normals as colors.
 * Uses the geometry's face normals mapped to RGB values.
 */
export function createDebugFaceNormalMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vNormal;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    varying vec3 vNormal;
    
    void main() {
      // Map normal from [-1, 1] to [0, 1]
      vec3 color = normalize(vNormal) * 0.5 + 0.5;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader
  });
}