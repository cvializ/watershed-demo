import * as THREE from "three";

import reflectionVisualizationFrag from "@/shaders/reflection-visualization.frag?raw";
import reflectionVisualizationVert from "@/shaders/reflection-visualization.vert?raw";

export type ReflectionVisualizationUniforms = {
  uWaterHeightmap: THREE.IUniform<THREE.Texture>;
  uCloudShadowMap: THREE.IUniform<THREE.Texture>;
  uSurfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  /** Drives the animated ripple field, so the surface keeps shimmering. */
  uTime: THREE.IUniform<number>;
  /**
   * Wind over the cultivated crop seen from the water: the same x/y wind the
   * water flow view binds, already turned into the field's world xz frame by
   * `cropGustTracker`, so a field looks the same from the water it grew on as
   * it does from above it.
   */
  uWind: THREE.IUniform<THREE.Vector2>;
  /**
   * How far the winds before the one the crop is riding have already dragged
   * the gust pattern, in world xz - the same three tracked values the clouds
   * are kept on, so a change of wind carries the pattern on from where the old
   * wind left it. See `createCropGustTracker` in
   * src/renderer/resources/cropGusts.ts.
   */
  uGustDrift: THREE.IUniform<THREE.Vector2>;
  /** When the wind the crop is riding was set, on the same clock as `uTime`. */
  uGustSetTime: THREE.IUniform<number>;
  uLightPosition: THREE.IUniform<THREE.Vector3>;
};

/**
 * Create a shader material that shows bodies of water with a reflective
 * surface: the reflected sky (plus a sun glint) is mixed over the water and
 * the terrain below it with a Fresnel curve, in the spirit of the water
 * height view but aimed at a mirror-like finish.
 */
export const createReflectionVisualizationMaterialResource = ({
  waterHeightMap,
  cloudShadowMap,
  surfaceMaterialMap,
  sunLightPosition,
}: {
  waterHeightMap: THREE.Texture;
  cloudShadowMap: THREE.Texture;
  surfaceMaterialMap?: THREE.Texture | null;
  sunLightPosition: THREE.Vector3;
}) => {
  const uniforms: Partial<ReflectionVisualizationUniforms> = {
    uWaterHeightmap: { value: waterHeightMap },
    uCloudShadowMap: { value: cloudShadowMap },
    uSurfaceMaterialMap: { value: surfaceMaterialMap ?? null },
    uTime: { value: 0 },
    // Same wind as the water flow view, and the same default, so the crop waves
    // with whatever the weather pane is set to and keeps the distance its
    // previous wind covered.
    uWind: { value: new THREE.Vector2(-0.1, 0.05) },
    uGustDrift: { value: new THREE.Vector2(0, 0) },
    uGustSetTime: { value: 0 },
    uLightPosition: { value: sunLightPosition.clone() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: reflectionVisualizationVert,
    fragmentShader: reflectionVisualizationFrag,
    side: THREE.DoubleSide,
  });

  return material;
};
