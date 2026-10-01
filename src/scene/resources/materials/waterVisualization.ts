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
   * `cloudWindY`), in world units a second along world x and z. The simulation
   * system writes the slider values in every pass, so the gusts follow whichever
   * way the wind is set; the default is the light westerly the pane starts on.
   */
  uWind: THREE.IUniform<THREE.Vector2>;
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
    // Same story for the wind: bound from the weather pane every pass, so the gusts
    // march along the direction the user set and die down when it is set to nothing.
    // The default is the wind the pane starts on, so a field is never becalmed before
    // the first pass binds it.
    uWind: { value: new THREE.Vector2(0.1, 0.05) },
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
