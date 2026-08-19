import * as THREE from "three";

import type { SceneSystem } from "@/scene/types";

import { GeneralObjectEnum } from "@/scene/resources/object";
import { getObject } from "@/scene/resources/objectCache";
import { getMaterial, MaterialEnum } from "@/scene/resources/material";

/**
 * Updates shadow map uniforms for materials that need to receive shadows
 * This is necessary because custom ShaderMaterials don't automatically receive shadow maps
 */
export const shadowMapUpdateSystem: SceneSystem = (_world, _scene): void => {
  // Get the sun light (directional light with shadows)
  const sunLight = getObject(
    GeneralObjectEnum.SunLight,
  ) as THREE.DirectionalLight;

  if (!sunLight || !sunLight.shadow) {
    return;
  }

  // Get the water visualization material
  const waterMaterial = getMaterial(
    MaterialEnum.WaterFlow,
  ) as THREE.ShaderMaterial;

  if (waterMaterial && waterMaterial.uniforms) {
    // Update shadow map uniform if it exists
    if (waterMaterial.uniforms.uShadowMap) {
      const shadowTexture = sunLight.shadow.map?.texture ?? null;
      waterMaterial.uniforms.uShadowMap.value = shadowTexture;
      // Set flag indicating whether shadow map is available
      if (waterMaterial.uniforms.uHasShadowMap) {
        waterMaterial.uniforms.uHasShadowMap.value = shadowTexture !== null;
      }
    }

    // Update light space matrix for shadow coordinate transformation
    if (waterMaterial.uniforms.uLightSpaceMatrix) {
      // Calculate the light space matrix: projection * view (from light's perspective)
      const shadowCamera = sunLight.shadow.camera;
      const lightMatrix = new THREE.Matrix4();

      // Get the shadow camera's view and projection matrices
      // The shadow camera is already positioned at the light and looking at origin
      const shadowView = shadowCamera.matrixWorldInverse.clone();
      const shadowProjection = shadowCamera.projectionMatrix.clone();

      // Combine to get light space matrix
      lightMatrix.multiplyMatrices(shadowProjection, shadowView);

      waterMaterial.uniforms.uLightSpaceMatrix.value = lightMatrix;
    }
  }
};