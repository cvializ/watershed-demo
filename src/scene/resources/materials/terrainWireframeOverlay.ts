import * as THREE from "three";

import terrainWireframeOverlayFrag from "@/shaders/visualizer/terrain-wireframe-overlay.frag?raw";
import terrainWireframeOverlayVert from "@/shaders/visualizer/terrain-wireframe-overlay.vert?raw";

export type TerrainWireframeOverlayUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uWireColor: THREE.IUniform<THREE.Color>;
  uLineWidth: THREE.IUniform<number>;
};

/**
 * Create a shader material that renders a wireframe overlay on terrain.
 * Uses UV grid pattern to show mesh triangle structure while following
 * the actual terrain height contours from the height map.
 */
export const createTerrainWireframeOverlayMaterialResource = ({
  heightmap,
}: {
  heightmap: THREE.Texture;
}) => {
  const uniforms: TerrainWireframeOverlayUniforms = {
    uHeightMap: { value: heightmap },
    uWireColor: { value: new THREE.Color(0xffff00) }, // Yellow
    uLineWidth: { value: 2.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: terrainWireframeOverlayVert,
    fragmentShader: terrainWireframeOverlayFrag,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false, // Don't occlude terrain underneath
  });
};