import type { ShaderMaterial } from "three";

import * as THREE from "three";

import cloudFragmentShader from "@/shaders/clouds.frag?raw";
import cloudVertexShader from "@/shaders/clouds.vert?raw";
import { TERRAIN_SIZE } from "@/terrain/constants";
import { logger } from "@/utils/logger";

/** Altitude of the cloud plane above the terrain datum (terrain tops out at 1.3). */
const CLOUD_ALTITUDE = 3.5;

/**
 * Uniform structure for cloud sphere shader.
 */
type CloudSphereUniforms = {
  uCloudTexture: THREE.IUniform<THREE.Texture>;
  uCameraPosition: THREE.IUniform<THREE.Vector3>;
  uTime: THREE.IUniform<number>;
  uCloudColor: THREE.IUniform<THREE.Color>;
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

  /**
   * Pushes cloud color from the world context into the visualization shader uniform.
   */
  setWeather: (world: {
    cloudColorR: number;
    cloudColorG: number;
    cloudColorB: number;
  }) => void;
};

/**
 * Creates a volumetric cloud sphere system using raymarching.
 *
 * This system renders translucent clouds as an overlay above the terrain
 * by sampling from a cloud density texture. The clouds appear puffy and round
 * with translucent edges that become more opaque as cloud density increases.
 *
 * Coordinates are shared with the terrain: the plane spans the full
 * `TERRAIN_SIZE` extent centred on the origin, so the cloud texture lines up
 * with the ground below it.
 *
 * @param renderer - WebGLRenderer instance (kept for API compatibility)
 * @param cloudTexture - Texture containing cloud density data from drifting-cloud.frag
 */
export const createCloudSphereSystem = (
  _renderer: THREE.WebGLRenderer,
  cloudTexture: THREE.Texture,
): CloudSphereSystem => {
  logger.info("[gpu:cloud-sphere:create]");

  // Create a plane that spans the whole terrain (-20..+20 on each axis), so the
  // cloud layer covers the ground instead of floating over a small patch of it.
  // The plane is centred on the origin like the terrain mesh, and its 0..1 uv
  // range lines up with the cloud texture's terrain-space mapping.
  const cloudPlaneGeometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    64,
    64,
  );

  // Create shader material for volumetric clouds using typed uniform pattern
  const uniforms: CloudSphereUniforms = {
    uCloudTexture: { value: cloudTexture },
    uCameraPosition: { value: new THREE.Vector3(0, 2, 5) },
    uTime: { value: 0.0 },
    uCloudColor: { value: new THREE.Color(0xf2fafc) }, // default: white/blue tint
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
  cloudMesh.position.set(0, CLOUD_ALTITUDE, 0); // centred above the terrain
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

  const setWeather = (world: {
    cloudColorR: number;
    cloudColorG: number;
    cloudColorB: number;
  }): void => {
    uniforms.uCloudColor.value.setRGB(world.cloudColorR, world.cloudColorG, world.cloudColorB);
  };

  return {
    update,
    getMesh,
    getMaterial,
    setWeather,
  };
};
