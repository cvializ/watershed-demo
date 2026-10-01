import * as THREE from "three";

import waterVisualizationFrag from "@/shaders/water-visualization.frag?raw";
import waterVisualizationVert from "@/shaders/water-visualization.vert?raw";

export type WaterVisualizationUniforms = {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uHeightMapSize: THREE.IUniform<THREE.Vector2>;
  uWaterHeightmap: THREE.IUniform<THREE.Texture>;
  uCloudShadowMap: THREE.IUniform<THREE.Texture>;
  uVelocityMap: THREE.IUniform<THREE.Texture>;
  /**
   * Substance field from the water quality variable. Null until the simulation system binds it, which is why
   * the fragment shader only samples it behind uShowPollutants.
   */
  uPollutantMap: THREE.IUniform<THREE.Texture | null>;
  /**
   * Ground compartments from the terrain quality variable, sampled for the species that live in the soil as well
   * as the water. Bound by the simulation system alongside uPollutantMap and read under the same flag.
   */
  uTerrainSubstanceMap: THREE.IUniform<THREE.Texture | null>;
  uShowPollutants: THREE.IUniform<number>;
  uPollutantSpecies: THREE.IUniform<number>;
  uMinHeight: THREE.IUniform<number>;
  uMaxHeight: THREE.IUniform<number>;
  uShowVelocity: THREE.IUniform<number>;
  uSurfaceMaterialMap: THREE.IUniform<THREE.Texture | null>;
  /** Drives the animated crop over the cultivated field, so the grain keeps waving. */
  uTime: THREE.IUniform<number>;
  /**
   * Wind over that crop: the x/y wind from the weather pane (`cloudWindX` /
   * `cloudWindY`), turned into the field's world xz frame - a wind of nothing
   * leaves the stand upright - by `cropGustTracker` in
   * src/renderer/resources/cropGusts.ts. The simulation system writes the
   * tracked values in every pass, so the gusts follow whichever way the wind is
   * set and march the same way the clouds travel; the default is the same light
   * westerly the pane starts on, already turned into that frame.
   */
  uWind: THREE.IUniform<THREE.Vector2>;
  /**
   * How far the winds before the one the crop is riding have already dragged
   * the gust pattern, in world xz - kept alongside `uWind` so a change of wind
   * carries the pattern on from where the old wind left it rather than jumping
   * it. See `createCropGustTracker` in src/renderer/resources/cropGusts.ts.
   */
  uGustDrift: THREE.IUniform<THREE.Vector2>;
  /**
   * When the wind the crop is riding was set, on the same clock as `uTime`, so
   * the shader can add the current wind's own distance to the banked distance
   * above - the same three tracked values the clouds are kept on.
   */
  uGustSetTime: THREE.IUniform<number>;
  uLightPosition: THREE.IUniform<THREE.Vector3>;
  uLightSpaceMatrix: THREE.IUniform<THREE.Matrix4>;
  // Wireframe overlay uniforms
  uWireframeColor: THREE.IUniform<THREE.Color>;
  uWireframeWidth: THREE.IUniform<number>;
  // Shadow map for receiving shadows from other objects
  uShadowMap: THREE.IUniform<THREE.Texture | null>;
  uHasShadowMap: THREE.IUniform<boolean>;
};

/**
 * Create a shader material that visualizes water flowing on terrain
 * This is the main water shader that manages each of the overlays.
 */
export const createWaterVisualizationMaterialResource = ({
  heightmap,
  waterHeightMap,
  cloudShadowMap,
  velocityMap,
  sunLightPosition,
  surfaceMaterialMap,
}: {
  heightmap: THREE.Texture;
  waterHeightMap: THREE.Texture;
  cloudShadowMap: THREE.Texture;
  velocityMap: THREE.Texture;
  sunLightPosition: THREE.Vector3;
  surfaceMaterialMap?: THREE.Texture | null;
}) => {
  const minHeight = -1.5;
  const maxHeight = 2.0;

  const uniforms: Partial<WaterVisualizationUniforms> = {
    uHeightMap: { value: heightmap },
    uHeightMapSize: { value: new THREE.Vector2(512, 512) },
    uWaterHeightmap: { value: waterHeightMap },
    uCloudShadowMap: { value: cloudShadowMap },
    uVelocityMap: { value: velocityMap },
    uMinHeight: { value: minHeight },
    uMaxHeight: { value: maxHeight },
    uShowVelocity: { value: 1 },
    uSurfaceMaterialMap: { value: surfaceMaterialMap ?? null },
    // Wind over the crop: the simulation system feeds game time in every pass, so a gust
    // that has crossed a cell stays crossed even after a load, and the field stops waving
    // when the game is paused along with everything else.
    uTime: { value: 0 },
    // Same story for the wind: bound from the weather pane every pass through
    // the tracked trail, so the gusts march along the bearing the clouds travel
    // on, keep the distance the previous wind covered, and die down when the
    // wind is set to nothing. The default is the wind the pane starts on, with
    // nothing travelled yet, so a field is never becalmed before the first pass
    // binds it.
    uWind: { value: new THREE.Vector2(-0.1, 0.05) },
    uGustDrift: { value: new THREE.Vector2(0, 0) },
    uGustSetTime: { value: 0 },
    // Substance overlay: off until a visualization mode asks for it, and the simulation system binds the
    // texture every pass it is asked for.
    uPollutantMap: { value: null },
    uTerrainSubstanceMap: { value: null },
    uShowPollutants: { value: 0 },
    uPollutantSpecies: { value: 0 },
    uLightPosition: { value: sunLightPosition.clone() },
    uLightSpaceMatrix: { value: new THREE.Matrix4() },
    // Wireframe overlay - enabled by default (yellow lines, width 2.0)
    uWireframeColor: { value: new THREE.Color(1.0, 1.0, 0.0) }, // Yellow
    uWireframeWidth: { value: 2.0 }, // Set to 0 to disable
    // Shadow map for receiving shadows from other objects (will be set by renderer)
    uShadowMap: { value: null },
    uHasShadowMap: { value: false },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: waterVisualizationVert,
    fragmentShader: waterVisualizationFrag,
    side: THREE.DoubleSide,
  });

  return material;
};
