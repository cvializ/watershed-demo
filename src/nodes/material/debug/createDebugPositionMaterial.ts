import * as THREE from "three";

/**
 * Creates a debug material that visualizes vertex positions as colors.
 * Uses the position attribute directly mapped to RGB values.
 */
export function createDebugPositionMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vPosition;
    
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vPosition = position;
    }
  `;

  const fragmentShader = `
    uniform float uMinX;
    uniform float uMaxX;
    uniform float uMinY;
    uniform float uMaxY;
    uniform float uMinZ;
    uniform float uMaxZ;
    varying vec3 vPosition;

    void main() {
      // Get the position from varying
      vec3 pos = vPosition;
      
      // Normalize to 0-1 range for each axis
      float r = (pos.x - uMinX) / (uMaxX - uMinX);
      float g = (pos.y - uMinY) / (uMaxY - uMinY);
      float b = (pos.z - uMinZ) / (uMaxZ - uMinZ);
      
      // Clamp values
      r = clamp(r, 0.0, 1.0);
      g = clamp(g, 0.0, 1.0);
      b = clamp(b, 0.0, 1.0);
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      uMinX: { value: -1.0 },
      uMaxX: { value: 1.0 },
      uMinY: { value: -1.0 },
      uMaxY: { value: 1.0 },
      uMinZ: { value: -1.0 },
      uMaxZ: { value: 1.0 },
    },
    vertexShader,
    fragmentShader,
  });
}
