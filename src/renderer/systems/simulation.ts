import type { ShaderMaterial } from "three";

import { query } from "bitecs";
import * as THREE from "three";

import type { RendererSystem } from "@/renderer/types";

import { MaterialRef, WaterSimulation } from "@/components/components";
import { waterSimulation } from "@/renderer/systems/renderInitSystem";
import { getMaterial } from "@/scene/resources/material";

export const simulationSystem: RendererSystem = (world, scene, _renderer, dt) => {
  if (!waterSimulation) {
    return;
  }

  const { showVelocity } = world;
  const [entity$] = query(world, [WaterSimulation, MaterialRef]);
  const material = getMaterial(MaterialRef.ref[entity$]) as ShaderMaterial;
  material.uniforms.uShowVelocity.value = showVelocity;

  // Update sun light position uniform for shadow calculation
  const sunLight = scene.getObjectByName("sun-light") as THREE.DirectionalLight;
  if (sunLight) {
    waterSimulation.setSunPosition(sunLight.position);
  }

  waterSimulation.compute(dt);
};
