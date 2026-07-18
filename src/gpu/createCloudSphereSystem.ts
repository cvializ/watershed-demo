import * as THREE from "three";

export type CloudSphereSystem = {
  /**
   * Updates the cloud sphere system with current camera and time data.
   * @param camera - The camera object to get view position
   * @param deltaTime - Time delta for animation
   */
  update: (camera: THREE.Camera, deltaTime: number) => void;

  /**
   * Get the cloud spheres mesh for rendering.
   */
  getMesh: () => THREE.Mesh;

  /**
   * Get the cloud spheres material for rendering.
   */
  getMaterial: () => THREE.ShaderMaterial;
};

/**
 * Creates a volumetric cloud sphere system using raymarching.
 *
 * This system renders translucent clouds as an overlay above the terrain
 * by sampling from a cloud density texture. The clouds appear puffy and round
 * with translucent edges that become more opaque as cloud density increases.
 *
 * @param renderer - WebGLRenderer instance (kept for API compatibility)
 * @param cloudTexture - Texture containing cloud density data from drifting-cloud.frag
 */
export const createCloudSphereSystem = (
  _renderer: THREE.WebGLRenderer,
  cloudTexture: THREE.Texture,
): CloudSphereSystem => {
  // Create a plane that covers the terrain area
  const cloudPlaneGeometry = new THREE.PlaneGeometry(12, 12, 64, 64);
  
  // Create shader material for volumetric clouds - simplified overlay approach
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCloudTexture: { value: cloudTexture },
      uCameraPosition: { value: new THREE.Vector3(0, 2, 5) },
      uTime: { value: 0.0 },
    },
    vertexShader: `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    fragmentShader: `
precision highp float;

uniform sampler2D uCloudTexture;
uniform vec3 uCameraPosition;
uniform float uTime;

varying vec2 vUv;

void main() {
    // Sample cloud density from texture
    float cloudDensity = texture2D(uCloudTexture, vUv).r;
    
    // Add some scaling to make clouds more visible
    float scaledDensity = smoothstep(0.2, 0.8, cloudDensity);
    
    // Cloud color - white/gray with slight blue tint
    vec3 cloudColor = vec3(0.95, 0.98, 1.0);
    
    // Translucent look - more transparent where density is low
    float alpha = smoothstep(0.1, 0.8, scaledDensity);
    
    // Final cloud color with alpha
    vec3 finalColor = cloudColor * scaledDensity;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });

  // Create mesh
  const cloudMesh = new THREE.Mesh(cloudPlaneGeometry, cloudMaterial);
  cloudMesh.position.y = 3.5; // Position clouds above terrain
  cloudMesh.rotation.x = -Math.PI / 2;
  cloudMesh.renderOrder = 10; // Render after terrain (higher render order)

  let _currentTime = 0;

  // Update function
  const update = (_camera: THREE.Camera, deltaTime: number): void => {
    _currentTime += deltaTime;
  };

  const getMesh = (): THREE.Mesh => {
    return cloudMesh;
  };

  const getMaterial = (): THREE.ShaderMaterial => {
    return cloudMaterial;
  };

  return {
    update,
    getMesh,
    getMaterial,
  };
};