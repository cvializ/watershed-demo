import type { ShaderMaterial } from "three";

import * as THREE from "three";

import cloudFragmentShader from "@/shaders/visualizer/clouds.frag?raw";
import cloudVertexShader from "@/shaders/visualizer/clouds.vert?raw";
import { logger } from "@/utils/logger";

/**
 * Uniform structure for cloud sphere shader.
 */
export type CloudSphereUniforms = {
  uCloudTexture: THREE.IUniform<THREE.Texture>;
  uCameraPosition: THREE.IUniform<THREE.Vector3>;
  uTime: THREE.IUniform<number>;
};

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
  getMaterial: () => ShaderMaterial;
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
  logger.info("[gpu:cloud-sphere:create]");

  // Create a plane that covers the terrain area
  const cloudPlaneGeometry = new THREE.PlaneGeometry(12, 12, 64, 64);

  // Create shader material for volumetric clouds using typed uniform pattern
  const uniforms: CloudSphereUniforms = {
    uCloudTexture: { value: cloudTexture },
    uCameraPosition: { value: new THREE.Vector3(0, 2, 5) },
    uTime: { value: 0.0 },
  };

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
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

  let currentTime = 0;

  // Update function
  const update = (_camera: THREE.Camera, deltaTime: number): void => {
    currentTime += deltaTime;
    uniforms.uTime.value = currentTime;
  };

  const getMesh = (): THREE.Mesh => {
    return cloudMesh;
  };

  const getMaterial = (): ShaderMaterial => {
    return cloudMaterial;
  };

  return {
    update,
    getMesh,
    getMaterial,
  };
};